/**
 * S24 — Tools I: Capability, Listing & the `Tool` type (§16.1–§16.4) tests.
 *
 * Each `describe` block maps to one acceptance criterion (AC-24.1 … AC-24.39).
 */

import { describe, it, expect } from 'vitest';
import {
  TOOLS_LIST_METHOD,
  TOOLS_CALL_METHOD,
  TOOLS_LIST_CHANGED_METHOD,
  ToolsCapabilitySchema,
  serverExposesTools,
  mayServerAnswerToolsList,
  mayClientSendToolsRequest,
  mayServerEmitToolsListChanged,
  mayClientExpectToolsListChanged,
  DEFAULT_SCHEMA_DIALECT,
  SUPPORTED_SCHEMA_DIALECTS,
  schemaDialect,
  isSupportedSchemaDialect,
  isInDocumentRef,
  hasExternalRef,
  schemaNestingDepth,
  DEFAULT_SCHEMA_LIMITS,
  UnsupportedDialectError,
  validateToolSchema,
  assertRegistrableToolSchema,
  TOOL_NAME_MIN_LENGTH,
  TOOL_NAME_MAX_LENGTH,
  TOOL_NAME_PATTERN,
  isConventionalToolName,
  ToolSchema,
  isTool,
  toolDisplayName,
  findDuplicateToolNames,
  disambiguateToolName,
  ListToolsRequestParamsSchema,
  ListToolsRequestSchema,
  ListToolsResultSchema,
  isListToolsResult,
  buildListToolsResult,
  buildListToolsRequest,
  type Tool,
} from '../../protocol/tools.js';

// ── Fixtures ────────────────────────────────────────────────────────────────

const minimalTool: Tool = {
  name: 'get_weather',
  inputSchema: { type: 'object' },
};

const fullTool: Tool = {
  name: 'get_weather_data',
  title: 'Weather Data Retriever',
  description: 'Get current weather data for a location',
  inputSchema: {
    type: 'object',
    properties: { location: { type: 'string', description: 'City name or zip code' } },
    required: ['location'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      temperature: { type: 'number' },
      conditions: { type: 'string' },
      humidity: { type: 'number' },
    },
    required: ['temperature', 'conditions', 'humidity'],
  },
  annotations: { title: 'Weather Data Retriever', readOnlyHint: true, openWorldHint: true },
  icons: [{ src: 'https://example.com/weather-icon.png', mimeType: 'image/png', sizes: ['48x48'] }],
};

const capsWithTools = { tools: {} };
const capsWithToolsListChanged = { tools: { listChanged: true } };
const capsWithToolsListChangedFalse = { tools: { listChanged: false } };
const capsWithoutTools = { resources: {} };

// ── AC-24.1 — server exposing tools declares `tools`; gating of list/call ──────
describe('AC-24.1 — tools capability declaration & gating (R-16.1-a, R-16.1-c)', () => {
  it('detects the `tools` capability after negotiation', () => {
    expect(serverExposesTools(capsWithTools)).toBe(true);
    expect(serverExposesTools(capsWithoutTools)).toBe(false);
  });

  it('a server does not honor tools/list or tools/call unless `tools` is declared', () => {
    expect(mayServerAnswerToolsList(capsWithoutTools, TOOLS_LIST_METHOD)).toBe(false);
    expect(mayServerAnswerToolsList(capsWithoutTools, TOOLS_CALL_METHOD)).toBe(false);
    expect(mayServerAnswerToolsList(capsWithTools, TOOLS_LIST_METHOD)).toBe(true);
    expect(mayServerAnswerToolsList(capsWithTools, TOOLS_CALL_METHOD)).toBe(true);
  });
});

// ── AC-24.2 — client must not send list/call when server lacks `tools` ─────────
describe('AC-24.2 — client gating (R-16.1-d)', () => {
  it('a client does not send tools/list or tools/call to a server lacking `tools`', () => {
    expect(mayClientSendToolsRequest(capsWithoutTools, TOOLS_LIST_METHOD)).toBe(false);
    expect(mayClientSendToolsRequest(capsWithoutTools, TOOLS_CALL_METHOD)).toBe(false);
  });
  it('a client MAY send them once `tools` is declared', () => {
    expect(mayClientSendToolsRequest(capsWithTools, TOOLS_LIST_METHOD)).toBe(true);
    expect(mayClientSendToolsRequest(capsWithTools, TOOLS_CALL_METHOD)).toBe(true);
  });
});

// ── AC-24.3 — listChanged gates emission of the notification ───────────────────
describe('AC-24.3 — list_changed emission gating (R-16.1-b)', () => {
  it('no notification when listChanged is absent or false', () => {
    expect(mayServerEmitToolsListChanged(capsWithTools)).toBe(false);
    expect(mayServerEmitToolsListChanged(capsWithToolsListChangedFalse)).toBe(false);
  });
  it('MAY emit when listChanged is true', () => {
    expect(mayServerEmitToolsListChanged(capsWithToolsListChanged)).toBe(true);
  });
  it('the notification method name matches the streaming constant', () => {
    expect(TOOLS_LIST_CHANGED_METHOD).toBe('notifications/tools/list_changed');
  });
});

// ── AC-24.4 — client must not rely on the notification without the flag ────────
describe('AC-24.4 — client must not rely on list_changed (R-16.1-e)', () => {
  it('does not expect the notification when listChanged is false or omitted', () => {
    expect(mayClientExpectToolsListChanged(capsWithTools)).toBe(false);
    expect(mayClientExpectToolsListChanged(capsWithToolsListChangedFalse)).toBe(false);
  });
  it('may expect it when listChanged is true', () => {
    expect(mayClientExpectToolsListChanged(capsWithToolsListChanged)).toBe(true);
  });
});

// ── AC-24.5 — declared server responds with the tool set ───────────────────────
describe('AC-24.5 — declared server answers tools/list (R-16.1-f)', () => {
  it('builds a complete result carrying the current tool set', () => {
    const result = buildListToolsResult({ tools: [fullTool], ttlMs: 300000, cacheScope: 'public' });
    expect(result.resultType).toBe('complete');
    expect(result.tools).toEqual([fullTool]);
    expect(ListToolsResultSchema.safeParse(result).success).toBe(true);
  });
});

// ── AC-24.6 — empty set is valid; set may change over time ─────────────────────
describe('AC-24.6 — empty/changing tool set (R-16.1-g)', () => {
  it('an empty tools array is a valid result', () => {
    const result = buildListToolsResult({ tools: [], ttlMs: 0, cacheScope: 'private' });
    expect(result.tools).toEqual([]);
    expect(isListToolsResult(result)).toBe(true);
  });
  it('a later request may return a different set', () => {
    const first = buildListToolsResult({ tools: [], ttlMs: 0, cacheScope: 'private' });
    const later = buildListToolsResult({ tools: [minimalTool], ttlMs: 0, cacheScope: 'private' });
    expect(first.tools).not.toEqual(later.tools);
  });
});

// ── AC-24.7 — same connection + same auth ⇒ identical set ──────────────────────
describe('AC-24.7 — set does not vary per-connection/side-effect (R-16.1-h)', () => {
  it('two builds from the same source produce identical tool sets', () => {
    const cfg = { tools: [fullTool, minimalTool], ttlMs: 1000, cacheScope: 'public' as const };
    const a = buildListToolsResult(cfg);
    const b = buildListToolsResult(cfg);
    expect(a.tools).toEqual(b.tools);
  });
});

// ── AC-24.8 — set MAY differ by authorization scope ────────────────────────────
describe('AC-24.8 — set may vary by authorization (R-16.1-i)', () => {
  it('different per-request credential views may yield different sets', () => {
    const scopedReader = buildListToolsResult({ tools: [minimalTool], ttlMs: 0, cacheScope: 'private' });
    const scopedAdmin = buildListToolsResult({ tools: [minimalTool, fullTool], ttlMs: 0, cacheScope: 'private' });
    expect(scopedAdmin.tools.length).toBeGreaterThan(scopedReader.tools.length);
  });
});

// ── AC-24.9 — deterministic ordering across unchanged requests ─────────────────
describe('AC-24.9 — deterministic ordering (R-16.2-o)', () => {
  it('preserves the provided order verbatim across repeated builds', () => {
    const ordered = [{ name: 'a', inputSchema: { type: 'object' as const } }, minimalTool, fullTool];
    const r1 = buildListToolsResult({ tools: ordered, ttlMs: 0, cacheScope: 'public' });
    const r2 = buildListToolsResult({ tools: ordered, ttlMs: 0, cacheScope: 'public' });
    expect(r1.tools.map((t) => t.name)).toEqual(r2.tools.map((t) => t.name));
    expect(r1.tools.map((t) => t.name)).toEqual(['a', 'get_weather', 'get_weather_data']);
  });
});

// ── AC-24.10 — optional opaque cursor on the request ───────────────────────────
describe('AC-24.10 — request cursor (R-16.2-a)', () => {
  it('accepts a request with an opaque cursor', () => {
    const req = buildListToolsRequest(1, 'page-2-opaque-token');
    expect(req.params?.cursor).toBe('page-2-opaque-token');
    expect(ListToolsRequestSchema.safeParse(req).success).toBe(true);
  });
  it('absence of cursor requests the first page (params may be omitted entirely)', () => {
    const req = buildListToolsRequest(1);
    expect(req.params).toBeUndefined();
    expect(ListToolsRequestSchema.safeParse(req).success).toBe(true);
    expect(ListToolsRequestParamsSchema.safeParse({}).success).toBe(true);
  });
});

// ── AC-24.11 — `tools` present as an array of Tool ─────────────────────────────
describe('AC-24.11 — tools array required (R-16.2-b)', () => {
  it('requires tools to be an array of Tool definitions', () => {
    expect(ListToolsResultSchema.safeParse({ resultType: 'complete', ttlMs: 0, cacheScope: 'public' }).success).toBe(false);
    expect(
      ListToolsResultSchema.safeParse({ resultType: 'complete', tools: [fullTool], ttlMs: 0, cacheScope: 'public' }).success,
    ).toBe(true);
  });
  it('rejects a tools entry that is not a valid Tool', () => {
    const bad = { resultType: 'complete', tools: [{ name: 'x' }], ttlMs: 0, cacheScope: 'public' };
    expect(ListToolsResultSchema.safeParse(bad).success).toBe(false);
  });
});

// ── AC-24.12 — nextCursor presence/absence + re-issue ──────────────────────────
describe('AC-24.12 — nextCursor pagination (R-16.2-c, R-16.2-d)', () => {
  it('a non-final page carries nextCursor; the final page omits it', () => {
    const nonFinal = buildListToolsResult({ tools: [minimalTool], ttlMs: 0, cacheScope: 'public', nextCursor: 'next' });
    const final = buildListToolsResult({ tools: [minimalTool], ttlMs: 0, cacheScope: 'public' });
    expect(nonFinal.nextCursor).toBe('next');
    expect('nextCursor' in final).toBe(false);
  });
  it('the client MAY re-issue tools/list with cursor set to the received nextCursor', () => {
    const next = buildListToolsResult({ tools: [], ttlMs: 0, cacheScope: 'public', nextCursor: 'abc' }).nextCursor!;
    const req = buildListToolsRequest(2, next);
    expect(req.params?.cursor).toBe('abc');
  });
});

// ── AC-24.13 — nextCursor treated as opaque (pass-through verbatim) ────────────
describe('AC-24.13 — opaque cursor pass-through (R-16.2-e, R-16.2-f)', () => {
  it('passes a structured-looking cursor through unchanged (never parses/constructs)', () => {
    const opaque = '{"offset":40}::weird//token';
    const req = buildListToolsRequest(3, opaque);
    expect(req.params?.cursor).toBe(opaque);
  });
  it('the empty string is a valid present cursor and is preserved', () => {
    const req = buildListToolsRequest(4, '');
    expect(req.params?.cursor).toBe('');
    expect(ListToolsRequestSchema.safeParse(req).success).toBe(true);
  });
});

// ── AC-24.14 — ttlMs ≥ 0 and cacheScope ∈ {public, private} ────────────────────
describe('AC-24.14 — ttlMs & cacheScope required (R-16.2-g, R-16.2-j)', () => {
  it('requires ttlMs to be a non-negative integer', () => {
    expect(ListToolsResultSchema.safeParse({ resultType: 'complete', tools: [], ttlMs: -1, cacheScope: 'public' }).success).toBe(false);
    expect(ListToolsResultSchema.safeParse({ resultType: 'complete', tools: [], ttlMs: 1.5, cacheScope: 'public' }).success).toBe(false);
    expect(ListToolsResultSchema.safeParse({ resultType: 'complete', tools: [], ttlMs: 0, cacheScope: 'public' }).success).toBe(true);
  });
  it('requires cacheScope to be public or private', () => {
    expect(ListToolsResultSchema.safeParse({ resultType: 'complete', tools: [], ttlMs: 0, cacheScope: 'shared' }).success).toBe(false);
    expect(ListToolsResultSchema.safeParse({ resultType: 'complete', tools: [], ttlMs: 0, cacheScope: 'private' }).success).toBe(true);
  });
  it('builder throws on an invalid ttlMs', () => {
    expect(() => buildListToolsResult({ tools: [], ttlMs: -5, cacheScope: 'public' })).toThrow(RangeError);
    expect(() => buildListToolsResult({ tools: [], ttlMs: 2.2, cacheScope: 'public' })).toThrow(RangeError);
  });
});

// ── AC-24.15 — ttlMs max-age semantics (0 = stale, N>0 = fresh window) ──────────
describe('AC-24.15 — ttlMs freshness semantics (R-16.2-h, R-16.2-i)', () => {
  it('ttlMs of 0 is permitted (immediately stale) and a positive value is permitted (fresh window)', () => {
    expect(buildListToolsResult({ tools: [], ttlMs: 0, cacheScope: 'public' }).ttlMs).toBe(0);
    expect(buildListToolsResult({ tools: [], ttlMs: 300000, cacheScope: 'public' }).ttlMs).toBe(300000);
  });
});

// ── AC-24.16 — cacheScope public/private sharing semantics ─────────────────────
describe('AC-24.16 — cacheScope sharing semantics (R-16.2-k, R-16.2-l)', () => {
  it('public and private are both representable on the result', () => {
    expect(buildListToolsResult({ tools: [], ttlMs: 1, cacheScope: 'public' }).cacheScope).toBe('public');
    expect(buildListToolsResult({ tools: [], ttlMs: 1, cacheScope: 'private' }).cacheScope).toBe('private');
  });
});

// ── AC-24.17 — resultType is "complete" ────────────────────────────────────────
describe('AC-24.17 — resultType complete (R-16.2-m)', () => {
  it('a tools/list result has resultType "complete"', () => {
    expect(buildListToolsResult({ tools: [], ttlMs: 0, cacheScope: 'public' }).resultType).toBe('complete');
  });
  it('rejects a missing resultType', () => {
    expect(ListToolsResultSchema.safeParse({ tools: [], ttlMs: 0, cacheScope: 'public' }).success).toBe(false);
  });
});

// ── AC-24.18 — optional `_meta` on the result ──────────────────────────────────
describe('AC-24.18 — result _meta (R-16.2-n)', () => {
  it('accepts a result with a _meta map and omits it when not supplied', () => {
    const withMeta = buildListToolsResult({ tools: [], ttlMs: 0, cacheScope: 'public', _meta: { 'x.y/z': 1 } });
    expect(withMeta._meta).toEqual({ 'x.y/z': 1 });
    const without = buildListToolsResult({ tools: [], ttlMs: 0, cacheScope: 'public' });
    expect('_meta' in without).toBe(false);
  });
});

// ── AC-24.19 — Tool.name present as a string ───────────────────────────────────
describe('AC-24.19 — Tool.name required (R-16.3-a)', () => {
  it('requires a string name', () => {
    expect(isTool(minimalTool)).toBe(true);
    expect(ToolSchema.safeParse({ inputSchema: { type: 'object' } }).success).toBe(false);
    expect(ToolSchema.safeParse({ name: 42, inputSchema: { type: 'object' } }).success).toBe(false);
  });
});

// ── AC-24.20 — name conventions ────────────────────────────────────────────────
describe('AC-24.20 — name conventions (R-16.3-b..f)', () => {
  it('exposes the 1–128 length bounds and the allowed-character pattern', () => {
    expect(TOOL_NAME_MIN_LENGTH).toBe(1);
    expect(TOOL_NAME_MAX_LENGTH).toBe(128);
    expect(TOOL_NAME_PATTERN.test('Get_weather-data.v2')).toBe(true);
  });
  it('accepts conventional names and rejects spaces/commas/special chars', () => {
    expect(isConventionalToolName('get_weather.data-2')).toBe(true);
    expect(isConventionalToolName('get weather')).toBe(false);
    expect(isConventionalToolName('a,b')).toBe(false);
    expect(isConventionalToolName('emoji😀')).toBe(false);
  });
  it('enforces the 1–128 length window', () => {
    expect(isConventionalToolName('')).toBe(false);
    expect(isConventionalToolName('a'.repeat(128))).toBe(true);
    expect(isConventionalToolName('a'.repeat(129))).toBe(false);
  });
  it('treats names case-sensitively (distinct names)', () => {
    expect(findDuplicateToolNames([{ name: 'Tool' }, { name: 'tool' }])).toEqual([]);
  });
  it('detects non-unique names within a server', () => {
    expect(findDuplicateToolNames([{ name: 'a' }, { name: 'a' }, { name: 'b' }])).toEqual(['a']);
  });
});

// ── AC-24.21 — aggregation collisions & disambiguation ─────────────────────────
describe('AC-24.21 — collision disambiguation (R-16.3-g, R-16.3-h)', () => {
  it('acknowledges a cross-server name collision', () => {
    const aggregated = [{ name: 'search' }, { name: 'search' }];
    expect(findDuplicateToolNames(aggregated)).toEqual(['search']);
  });
  it('applies a server-id prefixing disambiguation strategy', () => {
    expect(disambiguateToolName('serverA', 'search')).toBe('serverA.search');
    expect(disambiguateToolName('serverB', 'search')).toBe('serverB.search');
    expect(disambiguateToolName('s', 'search', '__')).toBe('s__search');
  });
});

// ── AC-24.22 — display-name precedence ─────────────────────────────────────────
describe('AC-24.22 — display name precedence (R-16.3-i)', () => {
  it('prefers title, then annotations.title, then name', () => {
    expect(toolDisplayName({ name: 'n', title: 'T', annotations: { title: 'A' } })).toBe('T');
    expect(toolDisplayName({ name: 'n', annotations: { title: 'A' } })).toBe('A');
    expect(toolDisplayName({ name: 'n' })).toBe('n');
  });
  it('title is optional on the Tool', () => {
    expect(isTool(minimalTool)).toBe(true);
    expect(minimalTool.title).toBeUndefined();
  });
});

// ── AC-24.23 — description optional + model selection hint ──────────────────────
describe('AC-24.23 — description (R-16.3-j)', () => {
  it('description is optional and accepted when present', () => {
    expect(isTool({ name: 'n', inputSchema: { type: 'object' } })).toBe(true);
    expect(isTool({ name: 'n', description: 'help the model choose', inputSchema: { type: 'object' } })).toBe(true);
  });
});

// ── AC-24.24 — inputSchema present, 2020-12, root type object ──────────────────
describe('AC-24.24 — inputSchema root type object (R-16.3-k, R-16.4-d)', () => {
  it('requires inputSchema with root type "object"', () => {
    expect(isTool({ name: 'n', inputSchema: { type: 'object' } })).toBe(true);
    expect(isTool({ name: 'n', inputSchema: { type: 'array' } })).toBe(false);
    expect(isTool({ name: 'n' })).toBe(false);
  });
  it('the 2020-12 dialect is the default for a schema without $schema', () => {
    expect(schemaDialect({ type: 'object' })).toBe(DEFAULT_SCHEMA_DIALECT);
    expect(validateToolSchema({ type: 'object' }, 'input').ok).toBe(true);
  });
});

// ── AC-24.25 — no-parameter tool still has a valid object schema ───────────────
describe('AC-24.25 — no-parameter inputSchema (R-16.3-l)', () => {
  it('accepts { type: "object", additionalProperties: false } and { type: "object" }', () => {
    expect(isTool({ name: 'n', inputSchema: { type: 'object', additionalProperties: false } })).toBe(true);
    expect(isTool({ name: 'n', inputSchema: { type: 'object' } })).toBe(true);
    expect(validateToolSchema({ type: 'object', additionalProperties: false }, 'input').ok).toBe(true);
  });
});

// ── AC-24.26 — optional Tool fields ────────────────────────────────────────────
describe('AC-24.26 — optional fields (R-16.3-m..p)', () => {
  it('accepts outputSchema, annotations, icons, and _meta', () => {
    expect(isTool(fullTool)).toBe(true);
    const parsed = ToolSchema.parse(fullTool);
    expect(parsed.outputSchema).toBeDefined();
    expect(parsed.annotations).toMatchObject({ readOnlyHint: true });
    expect(parsed.icons?.[0]?.src).toContain('https://');
    const withMeta = ToolSchema.parse({ ...minimalTool, _meta: { 'a.b/c': true } });
    expect(withMeta._meta).toEqual({ 'a.b/c': true });
  });
});

// ── AC-24.27 — default vs declared dialect ─────────────────────────────────────
describe('AC-24.27 — dialect default & declaration (R-16.4-a, R-16.4-b)', () => {
  it('no $schema ⇒ interpreted as JSON Schema 2020-12', () => {
    expect(schemaDialect({ type: 'object' })).toBe(DEFAULT_SCHEMA_DIALECT);
    expect(SUPPORTED_SCHEMA_DIALECTS.has(DEFAULT_SCHEMA_DIALECT)).toBe(true);
  });
  it('an explicit $schema governs interpretation', () => {
    const declared = 'http://json-schema.org/draft-07/schema#';
    expect(schemaDialect({ $schema: declared, type: 'object' })).toBe(declared);
  });
});

// ── AC-24.28 — other 2020-12 keywords permitted alongside root type ────────────
describe('AC-24.28 — permitted keywords (R-16.4-c)', () => {
  it('accepts properties/required/additionalProperties alongside root type object', () => {
    const schema = {
      type: 'object',
      properties: { a: { type: 'string' } },
      required: ['a'],
      additionalProperties: false,
    };
    expect(validateToolSchema(schema, 'input').ok).toBe(true);
    expect(isTool({ name: 'n', inputSchema: schema })).toBe(true);
  });
});

// ── AC-24.29 — outputSchema unrestricted root; structuredContent any JSON ──────
describe('AC-24.29 — outputSchema root unrestricted (R-16.4-e, R-16.4-v)', () => {
  it('accepts an outputSchema whose root type is array', () => {
    const arr = { type: 'array', items: { type: 'string' } };
    expect(validateToolSchema(arr, 'output').ok).toBe(true);
    expect(isTool({ name: 'list_active_sessions', inputSchema: { type: 'object', additionalProperties: false }, outputSchema: arr })).toBe(true);
  });
  it('accepts scalar / boolean / null-typed output roots (structuredContent is any JSON)', () => {
    for (const t of ['string', 'number', 'boolean', 'null']) {
      expect(validateToolSchema({ type: t }, 'output').ok).toBe(true);
    }
  });
});

// ── AC-24.30 — external $ref not fetched; only in-document resolved ────────────
describe('AC-24.30 — in-document-only $ref (R-16.4-f, R-16.4-g)', () => {
  it('classifies in-document refs vs external refs', () => {
    expect(isInDocumentRef('#')).toBe(true);
    expect(isInDocumentRef('#/$defs/Foo')).toBe(true);
    expect(isInDocumentRef('#anchor')).toBe(true);
    expect(isInDocumentRef('https://evil.example/schema.json')).toBe(false);
    expect(isInDocumentRef('./other.json#/Foo')).toBe(false);
    expect(isInDocumentRef('other.json')).toBe(false);
  });
  it('detects an external $ref/$dynamicRef anywhere in the schema without any I/O', () => {
    expect(hasExternalRef({ type: 'object', properties: { a: { $ref: '#/$defs/A' } } })).toBe(false);
    expect(hasExternalRef({ type: 'object', properties: { a: { $ref: 'https://evil/x' } } })).toBe(true);
    expect(hasExternalRef({ type: 'object', $dynamicRef: 'https://evil/x' })).toBe(true);
  });
  it('validation rejects an external $ref by default (no fetch performed)', () => {
    const schema = { type: 'object', properties: { a: { $ref: 'https://evil.example/x.json' } } };
    const res = validateToolSchema(schema, 'input');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/external \$ref/);
  });
  it('validation accepts in-document $ref resolution', () => {
    const schema = { type: 'object', properties: { a: { $ref: '#/$defs/A' } }, $defs: { A: { type: 'string' } } };
    expect(validateToolSchema(schema, 'input').ok).toBe(true);
  });
});

// ── AC-24.31 — opt-in external fetch is disabled by default ────────────────────
describe('AC-24.31 — opt-in external fetch defaults off (R-16.4-h, R-16.4-i)', () => {
  it('external fetching is off by default and rejects external refs', () => {
    const schema = { type: 'object', properties: { a: { $ref: 'https://h/x.json' } } };
    expect(validateToolSchema(schema, 'input').ok).toBe(false);
  });
  it('the external-ref check can only be relaxed by an explicit opt-in flag', () => {
    const schema = { type: 'object', properties: { a: { $ref: 'https://h/x.json' } } };
    // With opt-in enabled, the structural external-ref gate no longer rejects it
    // (this implementation does not perform the fetch; it merely stops rejecting).
    expect(validateToolSchema(schema, 'input', { allowExternalRefs: true }).ok).toBe(true);
  });
});

// ── AC-24.32 — unresolved external $ref ⇒ reject, not permissive ───────────────
describe('AC-24.32 — reject on unresolved external $ref (R-16.4-k)', () => {
  it('rejects (does not silently treat as permissive)', () => {
    const schema = { type: 'object', properties: { a: { $ref: 'https://h/x.json' } } };
    const res = validateToolSchema(schema, 'input');
    expect(res.ok).toBe(false);
    expect(() => assertRegistrableToolSchema(schema, 'input')).toThrow(TypeError);
  });
});

// ── AC-24.33 — bounded depth & node count ──────────────────────────────────────
describe('AC-24.33 — bounded depth/size (R-16.4-l, R-16.4-m)', () => {
  it('exposes default resource limits', () => {
    expect(DEFAULT_SCHEMA_LIMITS.maxDepth).toBeGreaterThan(0);
    expect(DEFAULT_SCHEMA_LIMITS.maxNodes).toBeGreaterThan(0);
  });
  it('measures nesting depth and caps recursion', () => {
    expect(schemaNestingDepth({ type: 'object' })).toBe(1);
    let deep: Record<string, unknown> = { type: 'object' };
    for (let i = 0; i < 5; i++) deep = { type: 'object', properties: { x: deep } };
    expect(schemaNestingDepth(deep)).toBeGreaterThan(1);
    // A pathologically deep schema is rejected rather than overflowing.
    let veryDeep: Record<string, unknown> = { type: 'object' };
    for (let i = 0; i < DEFAULT_SCHEMA_LIMITS.maxDepth + 10; i++) veryDeep = { type: 'object', properties: { x: veryDeep } };
    expect(validateToolSchema(veryDeep, 'input').ok).toBe(false);
  });
  it('rejects a schema exceeding the node-count limit', () => {
    const props: Record<string, unknown> = {};
    for (let i = 0; i < 5; i++) props[`p${i}`] = { type: 'string' };
    expect(validateToolSchema({ type: 'object', properties: props }, 'input', { limits: { maxDepth: 64, maxNodes: 2 } }).ok).toBe(false);
  });
});

// ── AC-24.34 — reject/refuse unsafe schemas (incl. null) ───────────────────────
describe('AC-24.34 — reject unsafe schemas (R-16.4-n)', () => {
  it('rejects a null schema', () => {
    expect(validateToolSchema(null, 'input').ok).toBe(false);
    expect(() => assertRegistrableToolSchema(null, 'input')).toThrow(TypeError);
  });
  it('rejects a non-object (array / primitive) schema', () => {
    expect(validateToolSchema([], 'input').ok).toBe(false);
    expect(validateToolSchema(42, 'input').ok).toBe(false);
  });
  it('refuses to register a schema requiring disallowed external dereferencing', () => {
    const schema = { type: 'object', $ref: 'https://h/x.json' };
    expect(() => assertRegistrableToolSchema(schema, 'input')).toThrow(TypeError);
  });
});

// ── AC-24.35 — validation roles (input args, output structuredContent) ─────────
describe('AC-24.35 — validation roles (R-16.4-o, R-16.4-p)', () => {
  it('an inputSchema is validatable (root object) for validating arguments', () => {
    expect(validateToolSchema(fullTool.inputSchema, 'input').ok).toBe(true);
  });
  it('an outputSchema is validatable for producing conforming structuredContent', () => {
    expect(validateToolSchema(fullTool.outputSchema, 'output').ok).toBe(true);
  });
  it('an inputSchema whose root is not object is rejected for the input role', () => {
    expect(validateToolSchema({ type: 'array' }, 'input').ok).toBe(false);
  });
});

// ── AC-24.36 — client output validation uses same in-document $ref rules ────────
describe('AC-24.36 — client-side output validation rules (R-16.4-q, R-16.4-r)', () => {
  it('the same in-document-only $ref gate applies to output schemas', () => {
    const external = { type: 'object', properties: { a: { $ref: 'https://h/x.json' } } };
    expect(validateToolSchema(external, 'output').ok).toBe(false);
    const local = { type: 'object', properties: { a: { $ref: '#/$defs/A' } }, $defs: { A: { type: 'number' } } };
    expect(validateToolSchema(local, 'output').ok).toBe(true);
  });
});

// ── AC-24.37 — dialect support & graceful failure on unsupported dialect ───────
describe('AC-24.37 — dialect validation & unsupported handling (R-16.4-s, R-16.4-t)', () => {
  it('validates against a supported (default 2020-12) dialect', () => {
    expect(isSupportedSchemaDialect(DEFAULT_SCHEMA_DIALECT)).toBe(true);
    expect(validateToolSchema({ type: 'object' }, 'input').ok).toBe(true);
  });
  it('returns an unsupported-dialect error rather than ignoring it or being permissive', () => {
    const unsupported = { $schema: 'http://json-schema.org/draft-07/schema#', type: 'object' };
    expect(isSupportedSchemaDialect('http://json-schema.org/draft-07/schema#')).toBe(false);
    const res = validateToolSchema(unsupported, 'input');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/unsupported dialect/);
    expect(() => assertRegistrableToolSchema(unsupported, 'input')).toThrow(UnsupportedDialectError);
  });
});

// ── AC-24.38 — supported dialect set is documented ─────────────────────────────
describe('AC-24.38 — documented supported dialects (R-16.4-u)', () => {
  it('exposes the supported-dialect set including JSON Schema 2020-12', () => {
    expect(SUPPORTED_SCHEMA_DIALECTS.has(DEFAULT_SCHEMA_DIALECT)).toBe(true);
    expect(SUPPORTED_SCHEMA_DIALECTS.size).toBeGreaterThanOrEqual(1);
  });
});

// ── AC-24.39 — human-in-the-loop (capability gating allows denial) ─────────────
describe('AC-24.39 — human can deny invocation (R-16-a)', () => {
  it('the capability layer is the gate a deny decision builds on (no UI mandated)', () => {
    // A human/host denying a tool is modeled at the gating boundary: with the
    // capability undeclared, the request is not sent/answered — the same hook a
    // deny decision uses. No specific UI model is mandated by the protocol.
    expect(mayClientSendToolsRequest(capsWithoutTools, TOOLS_CALL_METHOD)).toBe(false);
    expect(mayServerAnswerToolsList(capsWithoutTools, TOOLS_CALL_METHOD)).toBe(false);
  });
});

// ── Capability schema sanity ───────────────────────────────────────────────────
describe('ToolsCapabilitySchema', () => {
  it('accepts {} and { listChanged: boolean } and rejects a non-boolean flag', () => {
    expect(ToolsCapabilitySchema.safeParse({}).success).toBe(true);
    expect(ToolsCapabilitySchema.safeParse({ listChanged: true }).success).toBe(true);
    expect(ToolsCapabilitySchema.safeParse({ listChanged: 'yes' }).success).toBe(false);
  });
});
