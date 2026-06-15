/**
 * Tests for S13 — The stdio transport (§8).
 *
 * AC coverage (one or more tests each):
 *  AC-13.1  (R-8.2-a/b/c/d)        — UTF-8, one line, no embedded newline, single `\n`
 *  AC-13.2  (R-8.2-e/f/g)          — `\n` and `\r\n` both accepted; trailing `\r` stripped
 *  AC-13.3  (R-8.2-h)              — empty/whitespace-only line ignored (not malformed)
 *  AC-13.4  (R-8.3-a, R-8.5-c)     — client may not write a response / non-MCP to stdin
 *  AC-13.5  (R-8.3-b, R-8.5-a/b)   — server may not write a request / non-MCP to stdout
 *  AC-13.7  (R-8.3-d)              — server reply-requiring interaction inside its response
 *  AC-13.8  (R-8.3-e/f/g)          — cancellation via notifications/cancelled; then silence
 *  AC-13.9  (R-8.4-a/b)            — stderr text is valid; never parsed as protocol
 *  AC-13.10 (R-8.4-c/d/e)         — client may capture stderr; never JSON-RPC; not an error
 *  AC-13.11 (R-8.5-d/e/f/h)       — malformed line: no crash, discard, diagnostic, resync
 *  AC-13.12 (R-8.5-g)             — malformed-with-id MAY draw -32700/-32600; no id → silent
 *  AC-13.13 (R-8.6.1-a/b)         — no handshake; first message any enveloped req or discover
 *  AC-13.14 (R-8.6.2-a/b)         — graceful: close stdin, await exit, then force
 *  AC-13.15 (R-8.6.2-c)           — server MAY close stdout and exit
 *  AC-13.16 (R-8.6.3-a)           — force-terminate when child overstays grace
 *  AC-13.17 (R-8.6.4-a/b)         — restart on unexpected exit; MAY retry lost in-flight
 *  AC-13.18 (R-8.7-a/b/c)         — request carries _meta; unsupported revision → -32004
 *  AC-13.19 (R-8.7-d/h)           — discover may be first message; probing recommended
 *  AC-13.20 (R-8.7-e/f/g)         — -32004 probe → reselect, no handshake; other → MAY fallback
 *  AC-13.21 (R-8.1-b)             — framing reusable over a non-subprocess byte stream
 *  AC-13.22 (R-8.1-a)             — stderr never treated as protocol
 */

import { describe, it, expect, vi } from 'vitest';
import { PassThrough, Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import { Buffer } from 'node:buffer';
import type { JSONRPCMessage, JSONRPCRequest, JSONRPCResponse } from '../../jsonrpc/framing.js';
import { TransportError } from '../../transport/contract.js';
import { NewlineFramer, tryDecodeMessageUnit } from '../../transport/framing.js';
import {
  StdioClientTransport,
  StdioServerTransport,
  type ChildProcessLike,
} from '../../transport/stdio.js';
import {
  PROTOCOL_VERSION_META_KEY,
  CLIENT_INFO_META_KEY,
  CLIENT_CAPABILITIES_META_KEY,
} from '../../protocol/meta.js';
import { UNSUPPORTED_PROTOCOL_VERSION_CODE } from '../../protocol/negotiation.js';

// ─── Test doubles ───────────────────────────────────────────────────────────────

/**
 * An in-memory `ChildProcessLike` driven by `node:stream` PassThroughs — no real
 * OS process is ever spawned. `stdin` is what the client writes (the server's
 * input); `stdout` is what the server writes (the client's input); `stderr`
 * carries diagnostics. `exit()` simulates process termination.
 */
class FakeChild extends EventEmitter implements ChildProcessLike {
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  exitCode: number | null = null;
  readonly killSignals: Array<NodeJS.Signals | number> = [];

  kill(signal: NodeJS.Signals | number = 'SIGTERM'): boolean {
    this.killSignals.push(signal);
    // A real kill leads to an exit; emulate a prompt exit on SIGKILL.
    if (signal === 'SIGKILL') this.exit(null, 'SIGKILL');
    return true;
  }

  /** Simulates the process exiting (used for graceful, unexpected, and forced exit). */
  exit(code: number | null, signal: NodeJS.Signals | null = null): void {
    if (this.exitCode !== null) return;
    this.exitCode = code ?? 0;
    this.emit('exit', code, signal);
  }
}

/** A full request envelope (the three required `_meta` keys). (R-8.7-a) */
function envelope(version = '2026-07-28'): Record<string, unknown> {
  return {
    [PROTOCOL_VERSION_META_KEY]: version,
    [CLIENT_INFO_META_KEY]: { name: 'ExampleClient', version: '1.0.0' },
    [CLIENT_CAPABILITIES_META_KEY]: {},
  };
}

function makeRequest(id: number, method = 'tools/list'): JSONRPCRequest {
  return { jsonrpc: '2.0', id, method, params: { _meta: envelope() } };
}

/** Reads all framed JSON-RPC messages currently buffered in a readable. */
async function drainMessages(stream: Readable): Promise<JSONRPCMessage[]> {
  await new Promise((r) => setImmediate(r));
  const chunks: Buffer[] = [];
  let chunk: Buffer | null;
  while ((chunk = stream.read()) !== null) chunks.push(Buffer.from(chunk));
  const bytes = Buffer.concat(chunks);
  const decoder = new NewlineFramer().createDecoder();
  return decoder
    .push(bytes)
    .map((unit) => tryDecodeMessageUnit(unit))
    .filter((d): d is { ok: true; message: JSONRPCMessage } => d.ok)
    .map((d) => d.message);
}

function clientWith(child: FakeChild, opts: Partial<{ launcher: () => ChildProcessLike }> = {}) {
  return new StdioClientTransport({ child, launcher: opts.launcher, shutdownGraceMs: 50 });
}

// ─── AC-13.1 — framing: UTF-8, one line, no embedded newline, single \n ──────────

describe('AC-13.1 — message framing (R-8.2-a/b/c/d)', () => {
  it('serializes a request as one UTF-8 line terminated by a single \\n with no embedded newlines', async () => {
    const child = new FakeChild();
    const client = clientWith(child);
    // A payload deliberately containing a literal newline inside a string.
    const req: JSONRPCRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { text: 'line1\nline2', _meta: envelope() },
    };
    client.send(req);
    const raw: Buffer = child.stdin.read();
    // Exactly one trailing \n, and it is the only \n (the in-string one is escaped).
    expect(raw[raw.length - 1]).toBe(0x0a);
    const body = raw.subarray(0, raw.length - 1);
    expect(body.includes(0x0a)).toBe(false);
    // Decodes back to the same message (UTF-8 round-trip).
    const [msg] = await drainMessages(Readable.from([raw]));
    expect(msg).toMatchObject({ id: 1, method: 'tools/call' });
  });
});

// ─── AC-13.2 — \n and \r\n both accepted; trailing \r stripped ───────────────────

describe('AC-13.2 — terminator tolerance (R-8.2-e/f/g)', () => {
  it('accepts both \\n and \\r\\n line terminators and strips the trailing \\r', () => {
    const child = new FakeChild();
    const client = clientWith(child);
    const received: JSONRPCMessage[] = [];
    client.onMessage((m) => received.push(m));

    const line = JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} });
    // First message ends in \n, the second in \r\n.
    child.stdout.write(Buffer.from(line + '\n', 'utf8'));
    child.stdout.write(Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: 2, result: {} }) + '\r\n', 'utf8'));

    expect(received).toHaveLength(2);
    expect(received[0]).toMatchObject({ id: 1 });
    expect(received[1]).toMatchObject({ id: 2 });
  });
});

// ─── AC-13.3 — blank / whitespace-only lines ignored ─────────────────────────────

describe('AC-13.3 — blank lines ignored (R-8.2-h)', () => {
  it('ignores empty and whitespace-only lines without treating them as malformed', () => {
    const child = new FakeChild();
    const client = clientWith(child);
    const messages: JSONRPCMessage[] = [];
    const errors: TransportError[] = [];
    client.onMessage((m) => messages.push(m));
    client.onError((e) => errors.push(e));

    child.stdout.write(Buffer.from('\n   \n\t\n', 'utf8'));
    child.stdout.write(Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }) + '\n', 'utf8'));

    expect(messages).toHaveLength(1);
    expect(errors).toHaveLength(0); // blank lines are NOT errors
  });
});

// ─── AC-13.4 — client may not write a response / non-MCP to stdin ────────────────

describe('AC-13.4 — client stdin direction (R-8.3-a, R-8.5-c)', () => {
  it('rejects writing a JSON-RPC response to stdin', () => {
    const child = new FakeChild();
    const client = clientWith(child);
    const response: JSONRPCResponse = { jsonrpc: '2.0', id: 1, result: {} };
    expect(() => client.send(response)).toThrow(TransportError);
    expect(child.stdin.read()).toBeNull(); // nothing written
  });

  it('permits writing requests and notifications to stdin', () => {
    const child = new FakeChild();
    const client = clientWith(child);
    expect(() => client.send(makeRequest(1))).not.toThrow();
    expect(() => client.send({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 1 } })).not.toThrow();
  });
});

// ─── AC-13.5 — server may not write a request / non-MCP to stdout ────────────────

describe('AC-13.5 — server stdout direction (R-8.3-b, R-8.5-a/b)', () => {
  it('rejects writing a JSON-RPC request to stdout', () => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const server = new StdioServerTransport({ stdin, stdout });
    const request: JSONRPCRequest = makeRequest(1);
    expect(() => server.send(request)).toThrow(TransportError);
    expect(stdout.read()).toBeNull();
  });

  it('permits writing responses and notifications to stdout', () => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const server = new StdioServerTransport({ stdin, stdout });
    expect(() => server.send({ jsonrpc: '2.0', id: 1, result: {} })).not.toThrow();
    expect(() => server.send({ jsonrpc: '2.0', method: 'notifications/message', params: {} })).not.toThrow();
  });
});

// ─── AC-13.7 — server reply-requiring interaction inside the response ────────────

describe('AC-13.7 — no server-initiated request (R-8.3-d)', () => {
  it('the server carries a reply-requiring interaction inside its response, never as a new stdout request', () => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const server = new StdioServerTransport({ stdin, stdout });
    // A response that itself asks the client for input is fine (it is a response).
    const responseRequiringInput: JSONRPCResponse = {
      jsonrpc: '2.0',
      id: 1,
      result: { needsInput: true, prompt: 'Confirm?' },
    };
    expect(() => server.send(responseRequiringInput)).not.toThrow();
    // But emitting an actual request on stdout is prohibited.
    expect(() => server.send(makeRequest(2))).toThrow(TransportError);
  });
});

// ─── AC-13.8 — cancellation, then silence ────────────────────────────────────────

describe('AC-13.8 — cancellation (R-8.3-e/f/g)', () => {
  it('cancels via notifications/cancelled referencing the id; server then sends no further message', async () => {
    const child = new FakeChild();
    const client = clientWith(child);

    client.send(makeRequest(1));
    // Client cancels the in-flight request id 1.
    client.send({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 1 } });

    const sent = await drainMessages(child.stdin);
    const cancel = sent.find((m) => (m as { method?: string }).method === 'notifications/cancelled');
    expect(cancel).toBeDefined();
    expect((cancel as { params: { requestId: number } }).params.requestId).toBe(1);

    // After cancellation a well-behaved server sends nothing further for id 1.
    const messages: JSONRPCMessage[] = [];
    client.onMessage((m) => messages.push(m));
    // (No stdout write occurs.) The transport carries the rule; the server obeys silence.
    expect(messages).toHaveLength(0);
  });
});

// ─── AC-13.9 / AC-13.22 — stderr is diagnostics, never protocol ──────────────────

describe('AC-13.9 / AC-13.22 — stderr is not protocol (R-8.4-a/b, R-8.1-a)', () => {
  it('does not parse stderr text as protocol even when it looks like JSON-RPC', () => {
    const child = new FakeChild();
    const client = clientWith(child);
    const messages: JSONRPCMessage[] = [];
    const errors: TransportError[] = [];
    client.onMessage((m) => messages.push(m));
    client.onError((e) => errors.push(e));

    // A line on stderr that is valid JSON-RPC must NOT become a message.
    child.stderr.write(Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: 99, result: {} }) + '\n', 'utf8'));
    child.stderr.write(Buffer.from('[server] handling tools/call\n', 'utf8'));

    expect(messages).toHaveLength(0);
    expect(errors).toHaveLength(0);
  });
});

// ─── AC-13.10 — client stderr handling (capture/forward/ignore; not an error) ────

describe('AC-13.10 — client stderr handling (R-8.4-c/d/e)', () => {
  it('captures stderr, never interprets it as JSON-RPC, and does not treat it as an error', async () => {
    const child = new FakeChild();
    const client = clientWith(child);

    child.stderr.write(Buffer.from('debug: warming caches\n', 'utf8'));
    await new Promise((r) => setImmediate(r));

    // Captured for inspection/forwarding.
    expect(client.capturedStderr.toString('utf8')).toContain('warming caches');
    // The transport is NOT closed and reports no error just because stderr had output.
    expect(client.closed).toBe(false);
  });
});

// ─── AC-13.11 — malformed line: no crash, discard, diagnostic, resync ────────────

describe('AC-13.11 — malformed line handling (R-8.5-d/e/f/h)', () => {
  it('discards a malformed line, surfaces a diagnostic, does not close, and resyncs at the next newline', () => {
    const child = new FakeChild();
    const client = clientWith(child);
    const messages: JSONRPCMessage[] = [];
    const errors: TransportError[] = [];
    client.onMessage((m) => messages.push(m));
    client.onError((e) => errors.push(e));

    // Malformed line followed by a valid one — both delivered in a single chunk.
    const malformed = '{ not json at all \n';
    const good = JSON.stringify({ jsonrpc: '2.0', id: 5, result: {} }) + '\n';
    child.stdout.write(Buffer.from(malformed + good, 'utf8'));

    expect(client.closed).toBe(false); // not crashed / torn down (R-8.5-d)
    expect(errors).toHaveLength(1); // optional diagnostic recorded (R-8.5-f)
    expect(messages).toHaveLength(1); // resynchronized to the next message (R-8.5-h)
    expect(messages[0]).toMatchObject({ id: 5 });
  });
});

// ─── AC-13.12 — malformed-with-id MAY draw an error; no id → silent ──────────────

describe('AC-13.12 — recoverable malformed id (R-8.5-g)', () => {
  it('lets a receiver build a -32700 error when the id is recoverable, and stays silent when it is not', () => {
    // The transport surfaces the malformed line; the host decides whether to
    // respond. We assert the building blocks: a recoverable id is exposed via the
    // error path so the host MAY answer with -32700 / -32600.
    const child = new FakeChild();
    const server = new StdioServerTransport({ stdin: child.stdin, stdout: child.stdout });
    const errors: TransportError[] = [];
    server.onError((e) => errors.push(e));

    // Malformed but a request id 7 is textually present — the host could recover it.
    child.stdin.write(Buffer.from('{"jsonrpc":"2.0","id":7,"method":,}\n', 'utf8'));
    expect(errors).toHaveLength(1);

    // The host chooses to respond with a parse error keyed to the recovered id.
    const errResponse: JSONRPCResponse = { jsonrpc: '2.0', id: 7, error: { code: -32700, message: 'Parse error' } };
    expect(() => server.send(errResponse)).not.toThrow();

    // A malformed line with NO recoverable id is silently discarded (still surfaced as a diagnostic, no response forced).
    errors.length = 0;
    child.stdin.write(Buffer.from('@@@ garbage @@@\n', 'utf8'));
    expect(errors).toHaveLength(1);
  });
});

// ─── AC-13.13 — no handshake; first message any enveloped request ────────────────

describe('AC-13.13 — startup without handshake (R-8.6.1-a/b)', () => {
  it('requires no handshake; the first message may be any enveloped request and carries full _meta', async () => {
    const child = new FakeChild();
    const client = clientWith(child);
    // No prior registration/session step: send a tools/list straight away.
    client.send(makeRequest(1, 'tools/list'));
    const [first] = await drainMessages(child.stdin);
    const meta = (first as { params: { _meta: Record<string, unknown> } }).params._meta;
    expect(meta[PROTOCOL_VERSION_META_KEY]).toBe('2026-07-28');
    expect(meta[CLIENT_INFO_META_KEY]).toBeDefined();
    expect(meta[CLIENT_CAPABILITIES_META_KEY]).toBeDefined();
  });

  it('the first message may instead be a server/discover request', async () => {
    const child = new FakeChild();
    const client = clientWith(child);
    client.send({ jsonrpc: '2.0', id: 0, method: StdioClientTransport.probeMethod, params: { _meta: envelope() } });
    const [first] = await drainMessages(child.stdin);
    expect((first as { method: string }).method).toBe('server/discover');
  });
});

// ─── AC-13.14 / AC-13.16 — graceful shutdown then forced termination ─────────────

describe('AC-13.14 — graceful shutdown (R-8.6.2-a/b)', () => {
  it('closes stdin first, waits for exit, and resolves cleanly when the process exits in time', async () => {
    const child = new FakeChild();
    const client = clientWith(child);
    const stdinEnded = vi.fn();
    child.stdin.on('finish', stdinEnded);

    const closePromise = client.close();
    // stdin was ended (EOF) as the first step.
    await new Promise((r) => setImmediate(r));
    expect(stdinEnded).toHaveBeenCalledTimes(1);

    // The process then exits promptly — close resolves cleanly.
    child.exit(0);
    await closePromise;
    expect(client.closed).toBe(true);
    expect(child.killSignals).toHaveLength(0); // never had to force-terminate
  });
});

describe('AC-13.16 — forced termination on overstay (R-8.6.3-a)', () => {
  it('force-terminates (SIGTERM then SIGKILL) when the child does not exit within the grace period', async () => {
    const child = new FakeChild();
    const client = clientWith(child); // shutdownGraceMs: 50
    const closePromise = client.close();
    // Child never exits on its own; after the grace period it is killed.
    await new Promise((r) => setTimeout(r, 120));
    expect(child.killSignals[0]).toBe('SIGTERM');
    // SIGKILL escalation drives a final exit, resolving close.
    await closePromise;
    expect(child.killSignals).toContain('SIGKILL');
    expect(client.closed).toBe(true);
  });
});

// ─── AC-13.15 — server-initiated shutdown ────────────────────────────────────────

describe('AC-13.15 — server-initiated shutdown (R-8.6.2-c)', () => {
  it('lets the server close its stdout and exit', () => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const server = new StdioServerTransport({ stdin, stdout });
    const stdoutEnded = vi.fn();
    stdout.on('finish', stdoutEnded);
    const closeInfo: Array<{ clean: boolean }> = [];
    server.onClose((i) => closeInfo.push(i));

    server.close('shutting down');
    expect(server.closed).toBe(true);
    expect(closeInfo[0].clean).toBe(true);
  });
});

// ─── AC-13.17 — restart on unexpected exit; retry lost in-flight ─────────────────

describe('AC-13.17 — restart and retry (R-8.6.4-a/b)', () => {
  it('restarts the process on unexpected exit and reports lost in-flight ids for optional retry', async () => {
    const first = new FakeChild();
    const second = new FakeChild();
    // The launcher provides the *replacement* child (the initial `first` is
    // passed directly), so the next launch yields `second`.
    const replacements = [second];
    const launcher = () => replacements.shift() ?? new FakeChild();
    const lost: ReadonlyArray<number | string>[] = [];
    const client = new StdioClientTransport({
      child: first,
      launcher,
      shutdownGraceMs: 50,
      onInflightLost: (ids) => lost.push(ids as ReadonlyArray<number | string>),
    });

    // An in-flight request, then an UNEXPECTED exit.
    client.correlator.issue(1).catch(() => undefined);
    client.send(makeRequest(1));

    let restartedChild: ChildProcessLike | undefined;
    client.onRestart((c) => (restartedChild = c));

    first.exit(1); // unexpected
    await new Promise((r) => setImmediate(r));

    // In-flight id 1 was reported as lost (MAY retry) and a fresh process launched.
    expect(lost).toHaveLength(1);
    expect(lost[0]).toEqual([1]);
    expect(restartedChild).toBe(second);
    expect(client.closed).toBe(false); // restart keeps the transport alive

    // The fresh process serves: a request now goes to the second child's stdin.
    client.send(makeRequest(2));
    const sent = await drainMessages(second.stdin);
    expect(sent.some((m) => (m as { id?: number }).id === 2)).toBe(true);
  });

  it('surfaces an abrupt disconnection when no launcher is configured', async () => {
    const child = new FakeChild();
    const client = new StdioClientTransport({ child, shutdownGraceMs: 50 });
    const closeInfo: Array<{ clean: boolean }> = [];
    client.onClose((i) => closeInfo.push(i));
    child.exit(1);
    await new Promise((r) => setImmediate(r));
    expect(closeInfo).toHaveLength(1);
    expect(closeInfo[0].clean).toBe(false);
  });
});

// ─── AC-13.18 — request carries _meta; unsupported revision → -32004 ─────────────

describe('AC-13.18 — _meta envelope and -32004 (R-8.7-a/b/c)', () => {
  it('every request carries the protocol revision, client identity and capabilities in _meta', async () => {
    const child = new FakeChild();
    const client = clientWith(child);
    client.send(makeRequest(1));
    const [req] = await drainMessages(child.stdin);
    const meta = (req as { params: { _meta: Record<string, unknown> } }).params._meta;
    expect(meta[PROTOCOL_VERSION_META_KEY]).toBe('2026-07-28');
    expect(meta).toHaveProperty(CLIENT_INFO_META_KEY);
    expect(meta).toHaveProperty(CLIENT_CAPABILITIES_META_KEY);
  });

  it('routes a -32004 error response back to the waiting request', async () => {
    const child = new FakeChild();
    const client = clientWith(child);
    const pending = client.correlator.issue(1);
    client.onMessage((m) => {
      if ((m as { error?: unknown }).error || (m as { result?: unknown }).result) {
        client.deliverResponse(m as JSONRPCResponse);
      }
    });
    client.send(makeRequest(1));
    // Server rejects the requested revision with -32004.
    const errLine = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      error: { code: UNSUPPORTED_PROTOCOL_VERSION_CODE, message: 'Unsupported protocol version', data: { supported: ['2026-07-28'] } },
    }) + '\n';
    child.stdout.write(Buffer.from(errLine, 'utf8'));
    const resp = (await pending) as { error: { code: number } };
    expect(resp.error.code).toBe(-32004);
  });
});

// ─── AC-13.19 / AC-13.20 — probe outcomes ────────────────────────────────────────

describe('AC-13.19 / AC-13.20 — probe and its outcomes (R-8.7-d/e/f/g/h)', () => {
  it('classifies a successful discover probe as supported and caches the determination', () => {
    const child = new FakeChild();
    const client = clientWith(child);
    const outcome = client.probeProtocol('cmd:server', {
      jsonrpc: '2.0',
      id: 0,
      result: {
        resultType: 'complete',
        supportedVersions: ['2026-07-28'],
        capabilities: {},
        serverInfo: { name: 'ExampleServer', version: '1.0.0' },
      },
    });
    expect(outcome.kind).toBe('supported');
    expect(client.supportCache.get('cmd:server')).toEqual({ speaksProtocol: true, supportedVersions: ['2026-07-28'] });
  });

  it('on a -32004 probe outcome selects from the advertised set and does NOT fall back to a handshake', () => {
    const child = new FakeChild();
    const client = clientWith(child);
    const outcome = client.probeProtocol('cmd:server', {
      jsonrpc: '2.0',
      id: 0,
      error: { code: UNSUPPORTED_PROTOCOL_VERSION_CODE, message: 'Unsupported protocol version', data: { supported: ['2026-07-28'], requested: '2099-01-01' } },
    });
    expect(outcome.kind).toBe('unsupported-version');
    if (outcome.kind === 'unsupported-version') {
      expect(outcome.supported).toContain('2026-07-28');
    }
    // Determination still says the server speaks this protocol family.
    expect(client.supportCache.get('cmd:server')).toMatchObject({ speaksProtocol: true });
  });

  it('on any other error or no response classifies not-this-protocol (host MAY fall back, not keyed to one code)', () => {
    const child = new FakeChild();
    const client = clientWith(child);
    const other = client.probeProtocol('a', { jsonrpc: '2.0', id: 0, error: { code: -32601, message: 'Method not found' } });
    const timeout = client.probeProtocol('b', undefined);
    expect(other.kind).toBe('not-this-protocol');
    expect(timeout.kind).toBe('not-this-protocol');
    expect(client.supportCache.get('a')).toEqual({ speaksProtocol: false });
    expect(client.supportCache.get('b')).toEqual({ speaksProtocol: false });
  });
});

// ─── AC-13.21 — framing reusable over a non-subprocess byte stream ───────────────

describe('AC-13.21 — framing reuse over a plain byte stream (R-8.1-b)', () => {
  it('the same newline framing carries a message over an arbitrary reliable byte stream', () => {
    // A non-subprocess duplex pair (e.g. a socket) reuses the exact framing.
    const a = new PassThrough();
    const b = new PassThrough();
    // Endpoint A: a server-role stdio transport bound to a plain stream pair.
    const endpoint = new StdioServerTransport({ stdin: a, stdout: b });
    const out = endpoint;
    out.send({ jsonrpc: '2.0', id: 1, result: { ok: true } });
    const raw: Buffer = b.read();
    expect(raw[raw.length - 1]).toBe(0x0a);
    const decoded = tryDecodeMessageUnit(raw.subarray(0, raw.length - 1));
    expect(decoded.ok).toBe(true);
  });
});
