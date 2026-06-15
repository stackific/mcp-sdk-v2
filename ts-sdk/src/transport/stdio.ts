/**
 * S13 — The stdio transport (§8).
 *
 * A concrete `Transport` binding that carries the MCP `JSONRPCMessage` union over
 * the standard streams of a client-launched subprocess: client→server on the
 * child's `stdin`, server→client on the child's `stdout`, with free-form
 * diagnostics on `stderr` that are NEVER parsed as protocol (R-8.1-a, R-8.4-*).
 *
 * The binding adds only framing and process-lifecycle rules; the protocol
 * semantics are unchanged and ride on the reused mechanisms:
 *   - {@link NewlineFramer} / {@link FrameDecoder} — newline-delimited JSON, one
 *     message per UTF-8 line, no embedded newlines (R-8.2-a – R-8.2-h).
 *   - {@link decodeMessageUnit} / {@link tryDecodeMessageUnit} — UTF-8 +
 *     single-JSON-value + JSON-RPC validation; a malformed line is discarded,
 *     never fatal, and reading resynchronizes at the next newline (R-8.5-d – R-8.5-h).
 *   - {@link RequestCorrelator} — id-correlation/multiplexing and the
 *     fail-in-flight-on-disconnect behavior reused for restart/retry (R-8.6.4-b).
 *   - {@link isDirectionPermitted} — enforces that the client writes only
 *     requests/notifications to `stdin` and the server writes only
 *     responses/notifications to `stdout` (R-8.3-a, R-8.3-b, R-8.5-a, R-8.5-c).
 *   - {@link interpretProbeResponse} / {@link ProtocolSupportCache} — the §5.7
 *     backward-compat probe, applied here because stdio has no header layer
 *     (R-8.7-d – R-8.7-h).
 *
 * Testability: the subprocess I/O is injected through {@link ChildProcessLike};
 * tests drive both ends with in-memory `node:stream` `PassThrough`s rather than
 * spawning a real OS process. A convenience constructor for a real
 * `node:child_process` child is provided separately.
 */

import { Readable, Writable } from 'node:stream';
import { Buffer } from 'node:buffer';
import {
  classifyMessage,
  type JSONRPCMessage,
  type JSONRPCResponse,
  type RequestId,
} from '../jsonrpc/framing.js';
import {
  TransportError,
  isDirectionPermitted,
  type DirectionalKind,
  type MessageDirection,
  type Transport,
  type TransportCloseInfo,
  type Unsubscribe,
} from './contract.js';
import {
  NewlineFramer,
  tryDecodeMessageUnit,
  type FrameDecoder,
} from './framing.js';
import { RequestCorrelator } from './correlation.js';
import {
  interpretProbeResponse,
  ProtocolSupportCache,
  type ProbeOutcome,
  SERVER_DISCOVER_METHOD,
} from '../protocol/negotiation.js';

// ─── Injectable subprocess surface ─────────────────────────────────────────────

/**
 * The minimal view of a child process the stdio transport needs. (§8 topology)
 *
 * Modeled so the three streams can be in-memory `node:stream` objects in tests
 * (no real OS process), while a real `node:child_process.ChildProcess`
 * structurally satisfies the same shape. `stdin` is the client→server byte sink,
 * `stdout` the server→client byte source, and `stderr` an optional free-form
 * diagnostic source that is never parsed as protocol (R-8.1-a, R-8.4-b).
 */
export interface ChildProcessLike {
  /** Client→server byte sink. Closing it (`end()`) signals graceful shutdown (EOF). */
  readonly stdin: Writable | null;
  /** Server→client byte source carrying newline-framed JSON-RPC messages. */
  readonly stdout: Readable | null;
  /** Optional free-form UTF-8 diagnostics; NEVER parsed as protocol. (R-8.1-a) */
  readonly stderr?: Readable | null;
  /** The process exit code once exited, else `null`. */
  readonly exitCode?: number | null;
  /**
   * Forcibly signals the process. (R-8.6.3-a) On a real child this maps to
   * `ChildProcess.kill`; in tests it is observed to assert escalation occurred.
   */
  kill(signal?: NodeJS.Signals | number): boolean;
  /** Subscribes to the one-shot process-exit event (exit or signal). */
  on(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): unknown;
  /** Unsubscribes a previously registered listener. */
  off?(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): unknown;
}

/** A factory that (re)launches a fresh child process — used for restart. (R-8.6.4-a) */
export type ChildProcessLauncher = () => ChildProcessLike;

// ─── Stream role enforcement (§8.3, §8.5) ───────────────────────────────────────

/** Maps a `JSONRPCMessage` to the directionality kind used by `isDirectionPermitted`. */
function directionalKindOf(message: JSONRPCMessage): DirectionalKind {
  const classified = classifyMessage(message);
  switch (classified.kind) {
    case 'request':
      return 'request';
    case 'notification':
      return 'notification';
    case 'result-response':
    case 'error-response':
      return 'response';
  }
}

/**
 * Asserts that `message` may be written in `direction` on this header-less wire,
 * throwing a {@link TransportError} otherwise. (R-8.3-a, R-8.3-b, R-8.5-a, R-8.5-c)
 *
 * The client side passes `'client-to-server'` (only requests/notifications may
 * go to `stdin`; a response is rejected), the server side `'server-to-client'`
 * (only responses/notifications may go to `stdout`; a request is rejected).
 * Because `message` is already a classified `JSONRPCMessage`, non-MCP content
 * can never reach this point — it is rejected at decode time instead.
 */
function assertWritableDirection(message: JSONRPCMessage, direction: MessageDirection): void {
  const kind = directionalKindOf(message);
  if (!isDirectionPermitted(kind, direction)) {
    const channel = direction === 'client-to-server' ? "stdin" : "stdout";
    throw new TransportError(
      `a ${kind} may not be written to ${channel} (${direction}); only valid MCP messages of a permitted kind may be sent on this channel`,
    );
  }
}

// ─── Shared stdio endpoint ──────────────────────────────────────────────────────

/** Options shared by both stdio endpoints. */
interface StdioEndpointOptions {
  /** The direction messages this endpoint *sends* may travel (for role checks). */
  readonly sendDirection: MessageDirection;
  /** The byte sink this endpoint writes framed messages to. */
  readonly outbound: Writable | null;
  /** The byte source this endpoint reads framed messages from. */
  readonly inbound: Readable | null;
}

/**
 * Common stdio plumbing for both endpoints: newline framing over a byte sink,
 * a stateful decoder over a byte source, malformed-line tolerance, and the
 * observable message/error/close surface of {@link Transport}.
 *
 * Subclasses supply the concrete subprocess lifecycle (the client owns the
 * child; the server owns its own process exit).
 */
abstract class StdioEndpoint implements Transport {
  private readonly framer = new NewlineFramer();
  protected decoder: FrameDecoder = this.framer.createDecoder();
  private readonly messageHandlers = new Set<(message: JSONRPCMessage) => void>();
  private readonly errorHandlers = new Set<(error: TransportError) => void>();
  private readonly closeHandlers = new Set<(info: TransportCloseInfo) => void>();
  private inbox: JSONRPCMessage[] = [];
  private errorInbox: TransportError[] = [];
  private _closed = false;
  private closeInfo?: TransportCloseInfo;

  private readonly sendDirection: MessageDirection;
  protected outbound: Writable | null;
  protected inbound: Readable | null;
  private boundOnData = (chunk: Buffer): void => this.acceptBytes(chunk);

  protected constructor(options: StdioEndpointOptions) {
    this.sendDirection = options.sendDirection;
    this.outbound = options.outbound;
    this.inbound = options.inbound;
    this.wireInbound(this.inbound);
  }

  /** Attaches the framing decoder to a byte source. */
  protected wireInbound(source: Readable | null): void {
    if (source === null) return;
    source.on('data', this.boundOnData);
  }

  /** Detaches the framing decoder from a byte source (used on restart). */
  protected unwireInbound(source: Readable | null): void {
    if (source === null) return;
    source.off('data', this.boundOnData);
  }

  send(message: JSONRPCMessage): void {
    if (this._closed) {
      // Never silently drop: a send on a closed channel is an observable failure.
      // (R-7.2-q, R-7.2-s)
      throw new TransportError('cannot send on a closed stdio transport');
    }
    // Enforce the stream-role direction before anything touches the wire
    // (R-8.3-a, R-8.3-b, R-8.5-a, R-8.5-c).
    assertWritableDirection(message, this.sendDirection);
    if (this.outbound === null) {
      throw new TransportError('stdio transport has no writable channel');
    }
    // One compact UTF-8 JSON line terminated by a single `\n`, no embedded
    // newlines (`JSON.stringify` escapes any in-string `\n`). (R-8.2-a – R-8.2-d)
    const bytes = this.framer.encode(message);
    this.outbound.write(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  }

  /**
   * Feeds received bytes into the framing decoder and dispatches each recovered
   * line. A malformed line is discarded as a transport-level error (surfaced via
   * `onError`) and reading continues at the next newline — the connection is
   * never torn down. (R-8.5-d, R-8.5-e, R-8.5-h)
   */
  protected acceptBytes(chunk: Uint8Array): void {
    for (const unit of this.decoder.push(chunk)) {
      // An empty or whitespace-only line is not a message: ignore it rather
      // than treating it as malformed. (R-8.2-h)
      if (isBlankLine(unit)) continue;
      // A receiver SHOULD tolerate a preceding `\r` (a `\r\n` terminator) and
      // strip it before parsing. (R-8.2-f, R-8.2-g)
      const line = stripTrailingCarriageReturn(unit);
      const decoded = tryDecodeMessageUnit(line);
      if (decoded.ok) {
        this.dispatch(decoded.message);
      } else {
        // Malformed line: discard, optionally surface a diagnostic, keep reading.
        // (R-8.5-d, R-8.5-e, R-8.5-f, R-8.5-h)
        this.dispatchError(decoded.error);
      }
    }
  }

  private dispatch(message: JSONRPCMessage): void {
    if (this.messageHandlers.size === 0) {
      this.inbox.push(message);
      return;
    }
    for (const handler of [...this.messageHandlers]) handler(message);
  }

  private dispatchError(error: TransportError): void {
    if (this.errorHandlers.size === 0) {
      this.errorInbox.push(error);
      return;
    }
    for (const handler of [...this.errorHandlers]) handler(error);
  }

  onMessage(handler: (message: JSONRPCMessage) => void): Unsubscribe {
    this.messageHandlers.add(handler);
    if (this.inbox.length > 0) {
      const buffered = this.inbox;
      this.inbox = [];
      for (const message of buffered) handler(message);
    }
    return () => {
      this.messageHandlers.delete(handler);
    };
  }

  onError(handler: (error: TransportError) => void): Unsubscribe {
    this.errorHandlers.add(handler);
    if (this.errorInbox.length > 0) {
      const buffered = this.errorInbox;
      this.errorInbox = [];
      for (const error of buffered) handler(error);
    }
    return () => {
      this.errorHandlers.delete(handler);
    };
  }

  onClose(handler: (info: TransportCloseInfo) => void): Unsubscribe {
    if (this._closed && this.closeInfo !== undefined) {
      handler(this.closeInfo);
    } else {
      this.closeHandlers.add(handler);
    }
    return () => {
      this.closeHandlers.delete(handler);
    };
  }

  get closed(): boolean {
    return this._closed;
  }

  /** Marks the endpoint closed and notifies `onClose` subscribers exactly once. */
  protected markClosed(info: TransportCloseInfo): void {
    if (this._closed) return;
    this._closed = true;
    this.closeInfo = info;
    for (const handler of [...this.closeHandlers]) handler(info);
    this.closeHandlers.clear();
  }

  abstract close(reason?: string): void | Promise<void>;
}

// ─── Line helpers (§8.2) ────────────────────────────────────────────────────────

/** The carriage-return byte (`\r`, U+000D). */
const CARRIAGE_RETURN_BYTE = 0x0d;

/**
 * Returns `true` when a framed line is empty or only ASCII/Unicode whitespace —
 * such a line is not a JSON-RPC message and is ignored, not treated as malformed.
 * (R-8.2-h)
 */
function isBlankLine(line: Uint8Array): boolean {
  for (const byte of line) {
    // Space, tab, CR, vertical tab, form-feed — any non-whitespace byte means
    // the line carries content.
    if (byte !== 0x20 && byte !== 0x09 && byte !== 0x0d && byte !== 0x0b && byte !== 0x0c) {
      return false;
    }
  }
  return true;
}

/**
 * Strips a single trailing carriage return so a `\r\n` terminator decodes the
 * same as `\n`. The CR is not part of the message and MUST be removed before
 * parsing. (R-8.2-f, R-8.2-g)
 */
function stripTrailingCarriageReturn(line: Uint8Array): Uint8Array {
  if (line.length > 0 && line[line.length - 1] === CARRIAGE_RETURN_BYTE) {
    return line.subarray(0, line.length - 1);
  }
  return line;
}

// ─── StdioServerTransport ───────────────────────────────────────────────────────

/** Options for {@link StdioServerTransport}. */
export interface StdioServerTransportOptions {
  /** Byte source for client→server messages (defaults to `process.stdin`). */
  stdin?: Readable | null;
  /** Byte sink for server→client messages (defaults to `process.stdout`). */
  stdout?: Writable | null;
}

/**
 * The server side of a stdio connection: reads client requests/notifications
 * from `stdin` and writes responses/notifications to `stdout`. (§8 server role)
 *
 * Enforces the server stream-role rule — it MUST NOT write a JSON-RPC request to
 * `stdout` and MUST NOT write non-MCP content there; diagnostics belong on
 * `stderr` (R-8.3-b, R-8.5-a, R-8.5-b). Graceful shutdown is observed when
 * `stdin` reaches EOF, at which point the server SHOULD exit promptly
 * (R-8.6.2-b); the server MAY also initiate shutdown by closing `stdout`
 * (R-8.6.2-c) via {@link close}.
 */
export class StdioServerTransport extends StdioEndpoint {
  constructor(options: StdioServerTransportOptions = {}) {
    const stdin = options.stdin ?? (process.stdin as unknown as Readable);
    const stdout = options.stdout ?? (process.stdout as unknown as Writable);
    super({ sendDirection: 'server-to-client', outbound: stdout, inbound: stdin });
    // The server SHOULD exit promptly when `stdin` closes / returns EOF. Here we
    // surface that as an observable clean close so the host can exit. (R-8.6.2-b)
    this.inbound?.on('end', () => this.markClosed({ clean: true, reason: 'stdin EOF' }));
    this.inbound?.on('close', () => this.markClosed({ clean: true, reason: 'stdin closed' }));
  }

  /**
   * Server-initiated shutdown: closes `stdout` to the client and marks the
   * endpoint closed, after which the host process exits. (R-8.6.2-c)
   */
  close(reason?: string): void {
    if (this.closed) return;
    this.outbound?.end();
    this.markClosed({ clean: true, reason: reason ?? 'server closed stdout' });
  }
}

// ─── StdioClientTransport ───────────────────────────────────────────────────────

/** Options for {@link StdioClientTransport}. */
export interface StdioClientTransportOptions {
  /** The already-launched child process, or use {@link launcher} for restart support. */
  child?: ChildProcessLike;
  /**
   * A factory that launches a fresh child. REQUIRED to enable
   * restart-on-unexpected-exit (R-8.6.4-a); when provided and `child` is omitted,
   * the first child is launched immediately.
   */
  launcher?: ChildProcessLauncher;
  /**
   * Milliseconds to wait for the child to exit after `stdin` is closed before
   * forcibly terminating it. (R-8.6.2-a step 3, R-8.6.3-a) Defaults to 5000.
   */
  shutdownGraceMs?: number;
  /**
   * When `true`, an unexpected child exit triggers an automatic restart via
   * {@link launcher}. (R-8.6.4-a SHOULD) Defaults to `true` when a `launcher`
   * is supplied, `false` otherwise.
   */
  restartOnUnexpectedExit?: boolean;
  /**
   * A callback invoked with the ids of in-flight requests lost on an unexpected
   * exit, so the caller MAY retry them against the fresh process. (R-8.6.4-b)
   * Receives the restarted transport's `send`-ready state via {@link onRestart}.
   */
  onInflightLost?: (lostIds: ReadonlyArray<RequestId>) => void;
}

/**
 * The client side of a stdio connection: launches/holds a server subprocess,
 * writes requests/notifications to its `stdin`, and reads responses/notifications
 * from its `stdout`. (§8 client role)
 *
 * Responsibilities beyond framing:
 *   - Stream-role enforcement: only requests/notifications, and only valid MCP
 *     messages, may go to `stdin` (R-8.3-a, R-8.5-c).
 *   - `stderr` handling: captured/forwarded/ignored, never parsed as protocol,
 *     never assumed to mean an error (R-8.4-c, R-8.4-d, R-8.4-e, R-8.1-a).
 *   - Graceful shutdown: close `stdin` (EOF), await exit, force-terminate on
 *     timeout (R-8.6.2-a, R-8.6.3-a).
 *   - Unexpected-exit restart (SHOULD) and lost in-flight retry (MAY)
 *     (R-8.6.4-a, R-8.6.4-b).
 *   - The §5.7 probe via {@link probeProtocol} (R-8.7-d – R-8.7-h).
 */
export class StdioClientTransport extends StdioEndpoint {
  private child: ChildProcessLike;
  private readonly launcher?: ChildProcessLauncher;
  private readonly shutdownGraceMs: number;
  private readonly restartOnUnexpectedExit: boolean;
  private readonly onInflightLost?: (lostIds: ReadonlyArray<RequestId>) => void;

  /** Sender-side correlator; reused across a restart so ids may be retried. */
  readonly correlator = new RequestCorrelator();
  /** Per-endpoint protocol-support cache for the §5.7 probe. (R-5.7-e) */
  readonly supportCache = new ProtocolSupportCache();

  /** `stderr` chunks the client captured (it MAY capture/forward/ignore). (R-8.4-c) */
  private readonly stderrChunks: Buffer[] = [];
  private readonly restartHandlers = new Set<(child: ChildProcessLike) => void>();
  /** `true` while a client-initiated graceful close is in progress (so exit is "expected"). */
  private closing = false;
  private exitListener?: (code: number | null, signal: NodeJS.Signals | null) => void;
  private graceTimer?: ReturnType<typeof setTimeout>;

  constructor(options: StdioClientTransportOptions) {
    const child = options.child ?? options.launcher?.();
    if (child === undefined) {
      throw new TransportError('StdioClientTransport requires a `child` or a `launcher`');
    }
    super({ sendDirection: 'client-to-server', outbound: child.stdin, inbound: child.stdout });
    this.child = child;
    this.launcher = options.launcher;
    this.shutdownGraceMs = options.shutdownGraceMs ?? 5000;
    this.restartOnUnexpectedExit = options.restartOnUnexpectedExit ?? options.launcher !== undefined;
    this.onInflightLost = options.onInflightLost;
    this.wireChild(child);
  }

  /** Subscribes to `stderr` capture and the child's `exit` event. */
  private wireChild(child: ChildProcessLike): void {
    // stderr is free-form diagnostics — captured but NEVER decoded as protocol.
    // (R-8.1-a, R-8.4-b, R-8.4-d)
    child.stderr?.on('data', (chunk: Buffer) => {
      this.stderrChunks.push(Buffer.from(chunk));
    });
    this.exitListener = (code, signal) => this.handleExit(code, signal);
    child.on('exit', this.exitListener);
  }

  /** A copy of the captured `stderr` bytes (the client MAY forward/ignore). (R-8.4-c) */
  get capturedStderr(): Buffer {
    return Buffer.concat(this.stderrChunks);
  }

  /** Registers a handler invoked with the fresh child after a restart. */
  onRestart(handler: (child: ChildProcessLike) => void): Unsubscribe {
    this.restartHandlers.add(handler);
    return () => {
      this.restartHandlers.delete(handler);
    };
  }

  /**
   * Sends a `server/discover` probe and classifies the outcome per §5.7, caching
   * the per-endpoint determination. (R-8.7-d, R-8.7-h)
   *
   * Probing before any other request is RECOMMENDED even for a single-revision
   * client because it yields a deterministic capability answer. The three
   * outcomes are interpreted by the reused {@link interpretProbeResponse}:
   *   - `supported` / `unsupported-version` → the server speaks this family; the
   *     client selects a revision from the advertised set and continues, and MUST
   *     NOT fall back to a session-establishing handshake on the `-32004` outcome
   *     (R-8.7-e).
   *   - `not-this-protocol` (other error / no response) → a client with a
   *     handshake-based counterpart MAY fall back to its handshake; that fallback
   *     MUST NOT be keyed to one specific error code (R-8.7-f, R-8.7-g).
   *
   * @param endpointKey - Opaque per-endpoint key for the support cache.
   * @param response    - The probe response, or `null`/`undefined` for a timeout.
   */
  probeProtocol(endpointKey: string, response: unknown): ProbeOutcome {
    const outcome = interpretProbeResponse(response);
    this.supportCache.set(
      endpointKey,
      outcome.kind === 'not-this-protocol'
        ? { speaksProtocol: false }
        : {
            speaksProtocol: true,
            supportedVersions:
              outcome.kind === 'supported' ? outcome.supportedVersions : outcome.supported,
          },
    );
    return outcome;
  }

  /** The method a `server/discover` probe carries (for building the probe request). */
  static readonly probeMethod = SERVER_DISCOVER_METHOD;

  /**
   * Delivers an inbound response to the correlator and returns whether it matched
   * an outstanding request — a convenience for callers wiring `onMessage` to the
   * reused {@link RequestCorrelator}.
   */
  deliverResponse(response: JSONRPCResponse): boolean {
    return this.correlator.deliver(response);
  }

  /**
   * Graceful shutdown (R-8.6.2-a): (1) close the child's `stdin` (EOF — the only
   * portable graceful signal), (2) wait for the process to exit, (3) forcibly
   * terminate it if it does not exit within `shutdownGraceMs` (R-8.6.3-a).
   *
   * Resolves once the process has exited (or been force-terminated). The close
   * is observable via `onClose` with `clean: true`.
   */
  close(reason?: string): Promise<void> {
    if (this.closing || this.closed) return Promise.resolve();
    this.closing = true;
    // Step 1: close stdin → EOF. (R-8.6.2-a step 1)
    this.child.stdin?.end();
    return new Promise<void>((resolve) => {
      if (this.alreadyExited()) {
        this.finishClose(reason, resolve);
        return;
      }
      // Step 2: wait for exit, then resolve.
      const onExit = (): void => {
        if (this.graceTimer !== undefined) clearTimeout(this.graceTimer);
        this.finishClose(reason, resolve);
      };
      this.child.on('exit', onExit);
      // Step 3: escalate to a forced termination if it overstays. (R-8.6.3-a)
      this.graceTimer = setTimeout(() => {
        this.forceTerminate();
      }, this.shutdownGraceMs);
      // Avoid keeping the event loop alive solely for the grace timer.
      this.graceTimer.unref?.();
    });
  }

  /** Whether the child has already reported an exit code. */
  private alreadyExited(): boolean {
    return this.child.exitCode !== undefined && this.child.exitCode !== null;
  }

  private finishClose(reason: string | undefined, resolve: () => void): void {
    this.markClosed({ clean: true, reason: reason ?? 'client closed stdin (EOF)' });
    resolve();
  }

  /**
   * Forcibly terminates the child using the OS-appropriate mechanism — on POSIX
   * escalating `SIGTERM` then `SIGKILL`. (R-8.6.3-a)
   */
  private forceTerminate(): void {
    this.child.kill('SIGTERM');
    // Escalate to SIGKILL shortly after if still alive (POSIX example).
    const killTimer = setTimeout(() => {
      if (!this.alreadyExited()) this.child.kill('SIGKILL');
    }, Math.max(0, Math.floor(this.shutdownGraceMs / 2)));
    killTimer.unref?.();
  }

  /**
   * Handles a child `exit` event. A planned exit (during {@link close}) is a
   * clean close. An *unexpected* exit fails every in-flight request (so no
   * caller hangs) and, when a launcher is configured and restart is enabled,
   * launches a fresh process and re-wires the streams. (R-8.6.4-a, R-8.6.4-b)
   *
   * Active server-to-client streams are NOT preserved across the exit and MUST
   * be re-established per their owning feature S16 (§10) — out of scope here.
   * (R-8.6.4-c)
   */
  private handleExit(code: number | null, _signal: NodeJS.Signals | null): void {
    if (this.closing || this.closed) {
      // Expected exit as part of a graceful close — already handled / will be.
      if (!this.closed && this.alreadyExited()) {
        this.markClosed({ clean: true, reason: 'process exited after stdin close' });
      }
      return;
    }
    // Unexpected exit: fail in-flight so callers observe the loss, then capture
    // the lost ids for an optional retry against the fresh process.
    const lost = this.correlator.failAll(
      new TransportError(`stdio server exited unexpectedly (code ${String(code)})`),
    );
    this.onInflightLost?.(lost);

    if (this.restartOnUnexpectedExit && this.launcher !== undefined) {
      this.restart(this.launcher);
      return;
    }
    // No restart configured: surface an abrupt disconnection. (R-7.5-a)
    this.markClosed({ clean: false, reason: `process exited unexpectedly (code ${String(code)})` });
  }

  /**
   * Restarts the subprocess: detaches the old streams, launches a fresh child
   * via the launcher, and re-wires framing/stderr/exit so the same transport
   * keeps serving. The protocol is stateless, so the fresh process needs no
   * replay — each subsequent request carries its full `_meta`. (R-8.6.4-a)
   */
  private restart(launcher: ChildProcessLauncher): void {
    // Detach old wiring.
    this.unwireInbound(this.inbound);
    if (this.exitListener !== undefined) this.child.off?.('exit', this.exitListener);

    // Fresh child + fresh framing decoder (no carry-over of partial bytes).
    const next = launcher();
    this.child = next;
    this.outbound = next.stdin;
    this.inbound = next.stdout;
    this.decoder = new NewlineFramer().createDecoder();
    this.wireInbound(this.inbound);
    this.wireChild(next);

    for (const handler of [...this.restartHandlers]) handler(next);
  }
}

// ─── Real-process convenience (optional) ────────────────────────────────────────

/**
 * Adapts a real `node:child_process.ChildProcess` (or any structurally
 * compatible object) into a {@link ChildProcessLike}. (§8 launch)
 *
 * This is a thin pass-through: a Node `ChildProcess` already exposes
 * `stdin`/`stdout`/`stderr`, `exitCode`, `kill`, and an `'exit'` event, so it
 * satisfies the interface directly. Provided so real-spawn callers have a typed
 * entry point without the core logic depending on `node:child_process`.
 */
export function asChildProcessLike(child: ChildProcessLike): ChildProcessLike {
  return child;
}
