/**
 * Tests for S14 — Streamable HTTP: Request, Headers & Routing (§9.1–§9.5).
 *
 * AC coverage: AC-14.1 … AC-14.33 (see assertions below; each describe names its AC).
 */

import { describe, it, expect } from 'vitest';
import {
  // headers
  MCP_ENDPOINT_HTTP_METHOD,
  CONTENT_TYPE_HEADER,
  ACCEPT_HEADER,
  MCP_PROTOCOL_VERSION_HEADER,
  MCP_METHOD_HEADER,
  MCP_NAME_HEADER,
  CONTENT_TYPE_JSON,
  ACCEPT_MEDIA_TYPES,
  HEADER_MISMATCH_CODE,
  NOTIFICATION_ACCEPTED_STATUS,
  getHeader,
  buildPostHeaders,
  routingNameFor,
  methodRequiresMcpName,
  validatePostBodyFraming,
  validateHttpMethod,
  validateContentType,
  validateAccept,
  validateProtocolVersionHeader,
  validateRoutingHeaders,
  notificationHttpResponse,
  // encoding
  encodeHeaderValue,
  decodeHeaderValue,
  isSentinelEncoded,
  isAnnotatedIntegerInRange,
  MAX_SAFE_ANNOTATED_INTEGER,
  // param headers
  validateToolXMcpHeaders,
  filterValidTools,
  buildParamHeaders,
  validateParamHeaders,
  isParamHeader,
  STALE_SCHEMA_STRATEGY,
  type ToolDefinition,
} from '../../transport/http/index.js';
import { decodeMessageUnit, TransportError } from '../../transport/index.js';

const PV = '2026-07-28';
const meta = { 'io.modelcontextprotocol/protocolVersion': PV };

function toolsCallBody(args: Record<string, unknown> = { name: 'execute_sql', arguments: { query: 'SELECT 1' } }): unknown {
  return { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { ...args, _meta: meta } };
}

// ─── AC-14.1 — UTF-8 body (R-9.1-a) ─────────────────────────────────────────────

describe('POST body must be UTF-8 (AC-14.1)', () => {
  it('a valid UTF-8 JSON body decodes; invalid UTF-8 is rejected by the transport decoder', () => {
    const bytes = new TextEncoder().encode(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: { _meta: meta } }));
    expect(decodeMessageUnit(bytes)).toMatchObject({ method: 'tools/list' });
    expect(() => decodeMessageUnit(Uint8Array.from([0xff, 0xfe]))).toThrow(TransportError);
  });
});

// ─── AC-14.2 / AC-14.5 / AC-14.6 — body framing (R-9.1-b, R-9.2-c/d/e) ──────────

describe('POST body is exactly one request or notification (AC-14.2 · AC-14.5 · AC-14.6)', () => {
  it('accepts a single request', () => {
    expect(validatePostBodyFraming(toolsCallBody())).toEqual({ ok: true, kind: 'request' });
  });
  it('accepts a single notification', () => {
    expect(validatePostBodyFraming({ jsonrpc: '2.0', method: 'notifications/progress', params: { _meta: meta } }))
      .toEqual({ ok: true, kind: 'notification' });
  });
  it('rejects a JSON-RPC response (client never sends responses) (R-9.2-d)', () => {
    expect(validatePostBodyFraming({ jsonrpc: '2.0', id: 1, result: { resultType: 'complete' } }).ok).toBe(false);
  });
  it('rejects a batch array (R-9.2-e)', () => {
    expect(validatePostBodyFraming([toolsCallBody()]).ok).toBe(false);
  });
});

// ─── AC-14.3 — client supports both response shapes (R-9.1-c) ───────────────────

describe('client signals support for both response shapes (AC-14.3)', () => {
  it('Accept lists both application/json and text/event-stream', () => {
    expect([...ACCEPT_MEDIA_TYPES]).toEqual(['application/json', 'text/event-stream']);
    const headers = buildPostHeaders({ protocolVersion: PV, method: 'tools/list' });
    expect(getHeader(headers, ACCEPT_HEADER)).toContain('application/json');
    expect(getHeader(headers, ACCEPT_HEADER)).toContain('text/event-stream');
  });
});

// ─── AC-14.4 — POST method (R-9.2-a, R-9.2-b) ───────────────────────────────────

describe('each message is a POST (AC-14.4)', () => {
  it('the endpoint method is POST and non-POST is rejected', () => {
    expect(MCP_ENDPOINT_HTTP_METHOD).toBe('POST');
    expect(validateHttpMethod('POST').ok).toBe(true);
    expect(validateHttpMethod('GET').ok).toBe(false);
  });
});

// ─── AC-14.7 — required + routing headers present (R-9.2-f) ─────────────────────

describe('every POST carries required + routing headers (AC-14.7)', () => {
  it('buildPostHeaders includes Content-Type, Accept, MCP-Protocol-Version, Mcp-Method', () => {
    const headers = buildPostHeaders({ protocolVersion: PV, method: 'tools/call', params: { name: 'execute_sql' } });
    expect(getHeader(headers, CONTENT_TYPE_HEADER)).toBe(CONTENT_TYPE_JSON);
    expect(getHeader(headers, MCP_PROTOCOL_VERSION_HEADER)).toBe(PV);
    expect(getHeader(headers, MCP_METHOD_HEADER)).toBe('tools/call');
    expect(getHeader(headers, MCP_NAME_HEADER)).toBe('execute_sql');
  });
});

// ─── AC-14.8 — notification responses (R-9.2-g/h/i) ─────────────────────────────

describe('notification responses (AC-14.8)', () => {
  it('accepted → 202 with no body', () => {
    expect(notificationHttpResponse(true)).toEqual({ status: NOTIFICATION_ACCEPTED_STATUS });
  });
  it('rejected → error status with an id-less JSON-RPC error body', () => {
    const res = notificationHttpResponse(false, { error: { code: -32600, message: 'bad' } });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ jsonrpc: '2.0', error: { code: -32600, message: 'bad' } });
    expect('id' in (res.body ?? {})).toBe(false);
  });
});

// ─── AC-14.9 — request → §9.6 response shapes (S15) (R-9.2-j) ────────────────────

describe('a request is recognized so the server returns a §9.6 response (AC-14.9)', () => {
  it('a request body frames as a request (response shapes owned by S15)', () => {
    expect(validatePostBodyFraming(toolsCallBody()).ok).toBe(true);
  });
});

// ─── AC-14.10 — header name case-insensitive, value case-sensitive (R-9.3-a/b/c) ─

describe('header name/value casing (AC-14.10)', () => {
  it('field names match case-insensitively', () => {
    expect(getHeader({ 'content-type': 'application/json' }, 'Content-Type')).toBe('application/json');
  });
  it('values mirroring body fields compare exactly (case-sensitive)', () => {
    const body = toolsCallBody();
    const ok = validateRoutingHeaders({ 'Mcp-Method': 'tools/call', 'Mcp-Name': 'execute_sql' }, body);
    const bad = validateRoutingHeaders({ 'Mcp-Method': 'Tools/Call', 'Mcp-Name': 'execute_sql' }, body);
    expect(ok.ok).toBe(true);
    expect(bad.ok).toBe(false);
  });
});

// ─── AC-14.11 — Content-Type (R-9.3.1-a) ────────────────────────────────────────

describe('Content-Type application/json (AC-14.11)', () => {
  it('accepts application/json (with optional charset) and rejects others', () => {
    expect(validateContentType({ 'Content-Type': 'application/json' }).ok).toBe(true);
    expect(validateContentType({ 'Content-Type': 'application/json; charset=utf-8' }).ok).toBe(true);
    expect(validateContentType({ 'Content-Type': 'text/plain' }).ok).toBe(false);
  });
});

// ─── AC-14.12 — Accept both media types (R-9.3.2-a/b) ───────────────────────────

describe('Accept lists both media types (AC-14.12)', () => {
  it('accepts when both present; rejects when either missing', () => {
    expect(validateAccept({ Accept: 'application/json, text/event-stream' }).ok).toBe(true);
    expect(validateAccept({ Accept: 'application/json' }).ok).toBe(false);
    expect(validateAccept({ Accept: 'text/event-stream' }).ok).toBe(false);
  });
});

// ─── AC-14.13 — MCP-Protocol-Version equals body (R-9.3.3-a) ────────────────────

describe('MCP-Protocol-Version equals body _meta version (AC-14.13)', () => {
  it('accepts when header equals body version and is supported', () => {
    const result = validateProtocolVersionHeader({ 'MCP-Protocol-Version': PV }, toolsCallBody(), { supportedVersions: [PV] });
    expect(result).toEqual({ ok: true, version: PV });
  });
});

// ─── AC-14.14 — absent header (R-9.3.3-b/c) ─────────────────────────────────────

describe('absent MCP-Protocol-Version (AC-14.14)', () => {
  it('rejects with 400 + -32001 when pre-header clients unsupported', () => {
    const result = validateProtocolVersionHeader({}, toolsCallBody(), { supportedVersions: [PV] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.rejection.status).toBe(400);
      expect(result.rejection.error.code).toBe(HEADER_MISMATCH_CODE);
    }
  });
  it('MAY treat as earliest revision when pre-header clients supported', () => {
    const result = validateProtocolVersionHeader({}, toolsCallBody(), {
      supportedVersions: [PV, '2025-03-26'], supportsPreHeaderClients: true, earliestRevision: '2025-03-26',
    });
    expect(result).toEqual({ ok: true, version: '2025-03-26' });
  });
});

// ─── AC-14.15 — header/body mismatch (R-9.3.3-d) ────────────────────────────────

describe('MCP-Protocol-Version mismatch with body (AC-14.15)', () => {
  it('rejects with 400 + -32001', () => {
    const result = validateProtocolVersionHeader({ 'MCP-Protocol-Version': '2025-03-26' }, toolsCallBody(), { supportedVersions: [PV, '2025-03-26'] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.rejection.error.code).toBe(HEADER_MISMATCH_CODE);
  });
});

// ─── AC-14.16 — unsupported version → -32004 (R-9.3.3-e) ────────────────────────

describe('unsupported protocol version (AC-14.16)', () => {
  it('rejects with 400 + -32004 naming supported/requested', () => {
    const body = { jsonrpc: '2.0', id: 1, method: 'tools/list', params: { _meta: { 'io.modelcontextprotocol/protocolVersion': '2099-01-01' } } };
    const result = validateProtocolVersionHeader({ 'MCP-Protocol-Version': '2099-01-01' }, body, { supportedVersions: [PV] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.rejection.status).toBe(400);
      expect(result.rejection.error.code).toBe(-32004);
      expect((result.rejection.error.data as { supported: string[]; requested: string })).toEqual({ supported: [PV], requested: '2099-01-01' });
    }
  });
});

// ─── AC-14.17 — Mcp-Method (R-9.4-a, R-9.4.1-a) ─────────────────────────────────

describe('Mcp-Method mirrors body method verbatim (AC-14.17)', () => {
  it('accepts an exact match and rejects a case/verbatim difference', () => {
    const body = { jsonrpc: '2.0', id: 1, method: 'tools/list', params: { _meta: meta } };
    expect(validateRoutingHeaders({ 'Mcp-Method': 'tools/list' }, body).ok).toBe(true);
    expect(validateRoutingHeaders({ 'Mcp-Method': 'tools/LIST' }, body).ok).toBe(false);
    expect(validateRoutingHeaders({}, body).ok).toBe(false); // missing required
  });
});

// ─── AC-14.18 — Mcp-Name (R-9.4-b, R-9.4.2-a–e) ─────────────────────────────────

describe('Mcp-Name presence and value (AC-14.18)', () => {
  it('present on tools/call (params.name)', () => {
    expect(routingNameFor('tools/call', { name: 'execute_sql' })).toBe('execute_sql');
  });
  it('present on prompts/get (params.name)', () => {
    expect(routingNameFor('prompts/get', { name: 'greet' })).toBe('greet');
  });
  it('present on resources/read (params.uri)', () => {
    expect(routingNameFor('resources/read', { uri: 'file:///a' })).toBe('file:///a');
  });
  it('absent on methods without a targeted name/uri', () => {
    expect(methodRequiresMcpName('tools/list')).toBe(false);
    expect(routingNameFor('tools/list', {})).toBeUndefined();
    // sending Mcp-Name on tools/list is rejected
    const body = { jsonrpc: '2.0', id: 1, method: 'tools/list', params: { _meta: meta } };
    expect(validateRoutingHeaders({ 'Mcp-Method': 'tools/list', 'Mcp-Name': 'x' }, body).ok).toBe(false);
  });
});

// ─── AC-14.19 — routing mismatch/missing → 400 + -32001 (R-9.4.3-a) ─────────────

describe('routing-header rejection (AC-14.19)', () => {
  it('rejects when Mcp-Name disagrees with body (the §9.3 wire example)', () => {
    const body = toolsCallBody();
    const result = validateRoutingHeaders({ 'Mcp-Method': 'tools/call', 'Mcp-Name': 'wrong_tool' }, body);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.rejection.status).toBe(400);
      expect(result.rejection.error.code).toBe(-32001);
    }
  });
  it('rejects when a required routing header is missing', () => {
    const body = toolsCallBody();
    expect(validateRoutingHeaders({ 'Mcp-Method': 'tools/call' }, body).ok).toBe(false); // Mcp-Name missing
  });
});

// ─── AC-14.20 — server MAY designate; client MUST support (R-9.5-a/b/c) ─────────

describe('parameter-header mechanism support (AC-14.20)', () => {
  it('a client builds Mcp-Param-* headers from an annotated schema (client support)', () => {
    const schema = { type: 'object', properties: { region: { type: 'string', 'x-mcp-header': 'Region' } } };
    const headers = buildParamHeaders(schema, { region: 'us-west1' });
    expect(headers['Mcp-Param-Region']).toBe('us-west1');
  });
});

// ─── AC-14.21 — invalid x-mcp-header names (R-9.5.1-a/b/c/d) ─────────────────────

describe('x-mcp-header name validity (AC-14.21)', () => {
  const tool = (ann: unknown, second?: unknown): ToolDefinition => ({
    name: 't',
    inputSchema: {
      type: 'object',
      properties: {
        a: { type: 'string', 'x-mcp-header': ann },
        ...(second !== undefined ? { b: { type: 'string', 'x-mcp-header': second } } : {}),
      },
    },
  });
  it('rejects empty', () => expect(validateToolXMcpHeaders(tool('')).valid).toBe(false));
  it('rejects non-tchar', () => expect(validateToolXMcpHeaders(tool('bad name')).valid).toBe(false));
  it('rejects control char (CR/LF)', () => expect(validateToolXMcpHeaders(tool('a\r\nb')).valid).toBe(false));
  it('rejects case-insensitive duplicates', () => expect(validateToolXMcpHeaders(tool('Region', 'region')).valid).toBe(false));
  it('accepts a valid distinct pair', () => expect(validateToolXMcpHeaders(tool('Region', 'Zone')).valid).toBe(true));
});

// ─── AC-14.22 — annotated type & range & nesting (R-9.5.1-e/f/g/h) ──────────────

describe('x-mcp-header type/range/nesting (AC-14.22)', () => {
  const withType = (type: string): ToolDefinition => ({
    name: 't', inputSchema: { type: 'object', properties: { a: { type, 'x-mcp-header': 'A' } } },
  });
  it('honors integer/string/boolean', () => {
    expect(validateToolXMcpHeaders(withType('integer')).valid).toBe(true);
    expect(validateToolXMcpHeaders(withType('string')).valid).toBe(true);
    expect(validateToolXMcpHeaders(withType('boolean')).valid).toBe(true);
  });
  it('rejects number', () => expect(validateToolXMcpHeaders(withType('number')).valid).toBe(false));
  it('integer range bound is 2^53-1', () => {
    expect(MAX_SAFE_ANNOTATED_INTEGER).toBe(2 ** 53 - 1);
    expect(isAnnotatedIntegerInRange(2 ** 53 - 1)).toBe(true);
    expect(isAnnotatedIntegerInRange(2 ** 53)).toBe(false);
  });
  it('accepts annotation on a nested (non-top-level) property', () => {
    const nested: ToolDefinition = {
      name: 't',
      inputSchema: { type: 'object', properties: { outer: { type: 'object', properties: { inner: { type: 'integer', 'x-mcp-header': 'Inner' } } } } },
    };
    expect(validateToolXMcpHeaders(nested).valid).toBe(true);
  });
});

// ─── AC-14.23 — invalid-tool filtering (R-9.5.1-i/j/k/l) ─────────────────────────

describe('filtering excludes only the invalid tool (AC-14.23)', () => {
  it('keeps valid tools, drops the invalid one, and warns', () => {
    const good: ToolDefinition = { name: 'good', inputSchema: { type: 'object', properties: { r: { type: 'string', 'x-mcp-header': 'R' } } } };
    const bad: ToolDefinition = { name: 'bad', inputSchema: { type: 'object', properties: { n: { type: 'number', 'x-mcp-header': 'N' } } } };
    const result = filterValidTools([good, bad]);
    expect(result.tools.map((t) => t.name)).toEqual(['good']);
    expect(result.warnings).toEqual([{ tool: 'bad', reason: expect.stringContaining('N') }]);
  });
});

// ─── AC-14.24 / AC-14.25 — emission + server validation (R-9.5.2-a–f) ───────────

describe('Mcp-Param emission and server validation (AC-14.24 · AC-14.25)', () => {
  const schema = { type: 'object', properties: { region: { type: 'string', 'x-mcp-header': 'Region' }, query: { type: 'string' } } };
  it('appends one Mcp-Param header per annotated parameter present', () => {
    const headers = buildParamHeaders(schema, { region: 'us-west1', query: 'SELECT 1' });
    expect(headers).toEqual({ 'Mcp-Param-Region': 'us-west1' });
  });
  it('the server validates the header against the body', () => {
    const result = validateParamHeaders(schema, { region: 'us-west1', query: 'SELECT 1' }, { 'Mcp-Param-Region': 'us-west1' });
    expect(result.ok).toBe(true);
  });
});

// ─── AC-14.26 — null/absent omit (R-9.5.2-g/h/i/j) ──────────────────────────────

describe('null/absent annotated values omit the header (AC-14.26)', () => {
  const schema = { type: 'object', properties: { region: { type: 'string', 'x-mcp-header': 'Region' } } };
  it('null value → header omitted; server does not expect it', () => {
    expect(buildParamHeaders(schema, { region: null })).toEqual({});
    expect(validateParamHeaders(schema, { region: null }, {}).ok).toBe(true);
  });
  it('absent value → header omitted; server does not expect it', () => {
    expect(buildParamHeaders(schema, {})).toEqual({});
    expect(validateParamHeaders(schema, {}, {}).ok).toBe(true);
  });
});

// ─── AC-14.27 — body value present but header omitted → reject (R-9.5.2-k) ──────

describe('omitted header for a present body value is rejected (AC-14.27)', () => {
  it('rejects with -32001', () => {
    const schema = { type: 'object', properties: { region: { type: 'string', 'x-mcp-header': 'Region' } } };
    const result = validateParamHeaders(schema, { region: 'us-west1' }, {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.rejection.error.code).toBe(-32001);
  });
});

// ─── AC-14.28 — stale/absent schema strategy (R-9.5.2-l/m/n) ─────────────────────

describe('stale/absent schema strategy (AC-14.28)', () => {
  it('with no schema, emits no custom Mcp-Param headers', () => {
    expect(buildParamHeaders(undefined, { region: 'us-west1' })).toEqual({});
  });
  it('documents the retry-with-tools/list and pre-load strategies', () => {
    expect(STALE_SCHEMA_STRATEGY.SEND_WITHOUT_HEADERS).toBe('R-9.5.2-l');
    expect(STALE_SCHEMA_STRATEGY.RETRY_AFTER_TOOLS_LIST).toBe('R-9.5.2-m');
    expect(STALE_SCHEMA_STRATEGY.MAY_PRELOAD).toBe('R-9.5.2-n');
  });
});

// ─── AC-14.29 — value encoding (R-9.5.3-a/b/c/e) ────────────────────────────────

describe('parameter value encoding (AC-14.29)', () => {
  it('encodes per type: string as-is, integer decimal, boolean lowercase', () => {
    expect(encodeHeaderValue('us-west1')).toBe('us-west1');
    expect(encodeHeaderValue(42)).toBe('42');
    expect(encodeHeaderValue(-7)).toBe('-7');
    expect(encodeHeaderValue(true)).toBe('true');
    expect(encodeHeaderValue(false)).toBe('false');
  });
  it('sentinel-encodes a non-ASCII value with exact lowercase prefix/suffix', () => {
    const encoded = encodeHeaderValue('Hello, 世界');
    expect(encoded.startsWith('=?base64?')).toBe(true);
    expect(encoded.endsWith('?=')).toBe(true);
    expect(decodeHeaderValue(encoded)).toBe('Hello, 世界');
  });
  it('sentinel-encodes values with leading/trailing whitespace or control chars', () => {
    expect(isSentinelEncoded(encodeHeaderValue(' lead'))).toBe(true);
    expect(isSentinelEncoded(encodeHeaderValue('trail '))).toBe(true);
    expect(isSentinelEncoded(encodeHeaderValue('a\tb\nc'))).toBe(true);
  });
  it('sentinel-encodes a plain value that itself looks like a sentinel (R-9.5.3-e)', () => {
    const lookalike = '=?base64?abc?=';
    const encoded = encodeHeaderValue(lookalike);
    expect(encoded).not.toBe(lookalike);
    expect(decodeHeaderValue(encoded)).toBe(lookalike);
  });
});

// ─── AC-14.30 — receiver decodes sentinel (R-9.5.3-d) ───────────────────────────

describe('receiver detects and decodes the sentinel (AC-14.30)', () => {
  it('decodes the §9.5 example back to the original value', () => {
    expect(decodeHeaderValue('=?base64?SGVsbG8sIOS4lueVjA==?=')).toBe('Hello, 世界');
  });
});

// ─── AC-14.31 — intermediary forwards unknown param header (R-9.5.4-a) ──────────

describe('intermediary forwards unknown Mcp-Param header (AC-14.31)', () => {
  it('recognizes the Mcp-Param-* family (an intermediary forwards & ignores it)', () => {
    expect(isParamHeader('Mcp-Param-Region')).toBe(true);
    expect(isParamHeader('mcp-param-region')).toBe(true); // case-insensitive
    expect(isParamHeader('Mcp-Method')).toBe(false);
  });
});

// ─── AC-14.32 — body-processing receiver rejects bad/mismatched (R-9.5.4-b/c) ───

describe('receiver rejects impermissible/mismatched param headers (AC-14.32)', () => {
  const schema = { type: 'object', properties: { region: { type: 'string', 'x-mcp-header': 'Region' } } };
  it('rejects impermissible characters (raw non-ASCII, not sentinel)', () => {
    const result = validateParamHeaders(schema, { region: 'x' }, { 'Mcp-Param-Region': 'café' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.rejection.error.code).toBe(-32001);
  });
  it('rejects a decoded value that does not match the body', () => {
    const result = validateParamHeaders(schema, { region: 'us-west1' }, { 'Mcp-Param-Region': 'eu-central1' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.rejection.error.code).toBe(-32001);
  });
});

// ─── AC-14.33 — numeric integer comparison (R-9.5.4-d) ──────────────────────────

describe('integer header compared numerically (AC-14.33)', () => {
  it('header "42.0" matches body 42', () => {
    const schema = { type: 'object', properties: { limit: { type: 'integer', 'x-mcp-header': 'Limit' } } };
    expect(validateParamHeaders(schema, { limit: 42 }, { 'Mcp-Param-Limit': '42.0' }).ok).toBe(true);
    expect(validateParamHeaders(schema, { limit: 42 }, { 'Mcp-Param-Limit': '43' }).ok).toBe(false);
  });
});
