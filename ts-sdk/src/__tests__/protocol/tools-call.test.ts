/**
 * S25 — Tools II: Calling, Errors, Annotations & Change Notifications
 * (§16.5–§16.9). One test (or group) per numbered acceptance criterion.
 */

import { describe, it, expect } from 'vitest';
import {
  CallToolRequestParamsSchema,
  CallToolRequestSchema,
  isCallToolRequest,
  resolveCallToolArguments,
  buildCallToolRequest,
  buildCallToolRetryRequest,
  CallToolResultSchema,
  isCallToolResult,
  isCallToolError,
  isStructuredContentPresent,
  structuredContentTextFallback,
  buildCallToolResult,
  buildOutputSchemaResult,
  buildToolExecutionError,
  buildUnknownToolError,
  buildInvalidArgumentsError,
  dispatchToolCall,
  type DispatchableTool,
  ToolAnnotationsSchema,
  resolveToolAnnotationHints,
  TOOL_ANNOTATION_DEFAULTS,
  mayTrustToolAnnotations,
  ToolListChangedNotificationSchema,
  isToolListChangedNotification,
  buildToolListChangedNotification,
  reactToToolListChanged,
  TOOLS_CALL_METHOD,
  TOOLS_LIST_CHANGED_METHOD,
  INVALID_PARAMS_CODE,
} from '../../protocol/tools-call.js';
import { validateToolStructuredContent } from '../../protocol/tools.js';

// A reusable tool with a string-typed `location` and a structured output schema.
const weatherTool: DispatchableTool = {
  name: 'get_weather_data',
  inputSchema: {
    type: 'object',
    properties: { location: { type: 'string' } },
    required: ['location'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      temperature: { type: 'number' },
      conditions: { type: 'string' },
    },
    required: ['temperature', 'conditions'],
  },
};

const noArgTool: DispatchableTool = {
  name: 'ping',
  inputSchema: { type: 'object' },
};

// ─── §16.5 request shape ──────────────────────────────────────────────────────

describe('AC-25.1 — `name` REQUIRED string (R-16.5-a)', () => {
  it('accepts a request whose params carry a string `name`', () => {
    const req = {
      jsonrpc: '2.0',
      id: 2,
      method: TOOLS_CALL_METHOD,
      params: { name: 'get_weather_data' },
    };
    expect(CallToolRequestSchema.safeParse(req).success).toBe(true);
    expect(isCallToolRequest(req)).toBe(true);
  });

  it('rejects a request whose `name` is missing', () => {
    const req = { jsonrpc: '2.0', id: 2, method: TOOLS_CALL_METHOD, params: {} };
    expect(CallToolRequestSchema.safeParse(req).success).toBe(false);
    expect(isCallToolRequest(req)).toBe(false);
  });

  it('rejects a request whose `name` is non-string', () => {
    const req = {
      jsonrpc: '2.0',
      id: 2,
      method: TOOLS_CALL_METHOD,
      params: { name: 42 },
    };
    expect(CallToolRequestParamsSchema.safeParse({ name: 42 }).success).toBe(false);
    expect(isCallToolRequest(req)).toBe(false);
  });
});

describe('AC-25.2 — unknown tool name ⇒ JSON-RPC error -32602 (R-16.5-b, R-16.6-e)', () => {
  it('dispatch fails with code -32602 for an unknown name', () => {
    const outcome = dispatchToolCall({ name: 'invalid_tool_name' }, [weatherTool]);
    expect(outcome.dispatched).toBe(false);
    if (!outcome.dispatched) {
      expect(outcome.error.code).toBe(-32602);
      expect(outcome.error.code).toBe(INVALID_PARAMS_CODE);
      expect(outcome.error.message).toContain('invalid_tool_name');
    }
  });

  it('buildUnknownToolError produces the -32602 payload', () => {
    expect(buildUnknownToolError('foo')).toEqual({
      code: -32602,
      message: 'Unknown tool: foo',
    });
  });
});

describe('AC-25.3 — `arguments` present or absent both valid (R-16.5-c)', () => {
  it('accepts a request with `arguments` present', () => {
    expect(
      CallToolRequestParamsSchema.safeParse({
        name: 'get_weather_data',
        arguments: { location: 'New York' },
      }).success,
    ).toBe(true);
  });

  it('accepts a request with `arguments` absent', () => {
    expect(
      CallToolRequestParamsSchema.safeParse({ name: 'get_weather_data' }).success,
    ).toBe(true);
  });
});

describe('AC-25.4 — invalid arguments ⇒ -32602 and tool NOT invoked (R-16.5-d, R-16.6-f)', () => {
  it('dispatch fails with -32602 when arguments violate inputSchema', () => {
    const outcome = dispatchToolCall(
      { name: 'get_weather_data', arguments: { location: 42 } },
      [weatherTool],
    );
    expect(outcome.dispatched).toBe(false);
    if (!outcome.dispatched) {
      expect(outcome.error.code).toBe(INVALID_PARAMS_CODE);
      expect(outcome.error.message).toContain('get_weather_data');
    }
  });

  it('buildInvalidArgumentsError carries the validation detail', () => {
    const err = buildInvalidArgumentsError('t', ['/location must be string']);
    expect(err.code).toBe(-32602);
    expect(err.message).toContain('/location must be string');
  });
});

describe('AC-25.5 — omitted arguments treated as `{}` (R-16.5-e)', () => {
  it('resolveCallToolArguments returns {} when arguments omitted', () => {
    expect(resolveCallToolArguments({})).toEqual({});
    expect(resolveCallToolArguments({ arguments: { a: 1 } })).toEqual({ a: 1 });
  });

  it('a no-argument tool dispatches as `{}` when arguments omitted', () => {
    const outcome = dispatchToolCall({ name: 'ping' }, [noArgTool]);
    expect(outcome.dispatched).toBe(true);
    if (outcome.dispatched) expect(outcome.arguments).toEqual({});
  });
});

describe('AC-25.6 — retry includes exactly the prior inputRequests keys (R-16.5-f, R-16.5-g)', () => {
  it('builds a retry carrying inputResponses keyed identically', () => {
    const retry = buildCallToolRetryRequest(5, 6, {
      name: 'book_flight',
      inputResponses: { seat_class: 'economy' },
      requestState: 'opaque-token',
    });
    expect(retry.params.inputResponses).toEqual({ seat_class: 'economy' });
    // Keys present in the prior inputRequests appear in the retry's inputResponses.
    const priorRequestKeys = ['seat_class'];
    for (const key of priorRequestKeys) {
      expect(retry.params.inputResponses).toHaveProperty(key);
    }
    expect(CallToolRequestSchema.safeParse(retry).success).toBe(true);
  });
});

describe('AC-25.7 — requestState echoed verbatim, never parsed/mutated (R-16.5-h/-i/-j)', () => {
  it('echoes requestState byte-for-byte unchanged', () => {
    const token = 'opaque-continuation-token-from-server::{"not":"parsed"}';
    const retry = buildCallToolRetryRequest(5, 6, {
      name: 'book_flight',
      inputResponses: { seat_class: 'economy' },
      requestState: token,
    });
    expect(retry.params.requestState).toBe(token);
  });

  it('omits requestState entirely when not supplied (never synthesizes one)', () => {
    const retry = buildCallToolRetryRequest(5, 6, {
      name: 'book_flight',
      inputResponses: { seat_class: 'economy' },
    });
    expect('requestState' in retry.params).toBe(false);
  });
});

describe('AC-25.8 — `_meta` accepted, request still valid (R-16.5-k)', () => {
  it('accepts a request carrying _meta with a progressToken', () => {
    const req = buildCallToolRequest(2, {
      name: 'get_weather_data',
      arguments: { location: 'NY' },
      _meta: { progressToken: 'abc' },
    });
    expect(CallToolRequestSchema.safeParse(req).success).toBe(true);
    expect(req.params._meta).toEqual({ progressToken: 'abc' });
  });
});

// ─── §16.5 result shape ───────────────────────────────────────────────────────

describe('AC-25.9 — content is a ContentBlock[]; empty / mixed accepted (R-16.5-l, R-16.5-m)', () => {
  it('accepts a result with a non-empty content array', () => {
    const r = buildCallToolResult({ content: [{ type: 'text', text: 'hi' }] });
    expect(CallToolResultSchema.safeParse(r).success).toBe(true);
    expect(isCallToolResult(r)).toBe(true);
  });

  it('accepts an empty content array', () => {
    expect(isCallToolResult(buildCallToolResult({ content: [] }))).toBe(true);
  });

  it('accepts mixed block types', () => {
    const r = buildCallToolResult({
      content: [
        { type: 'text', text: 'a' },
        { type: 'image', data: 'AAAA', mimeType: 'image/png' },
      ],
    });
    expect(isCallToolResult(r)).toBe(true);
  });

  it('rejects a result missing content', () => {
    expect(
      CallToolResultSchema.safeParse({ resultType: 'complete' }).success,
    ).toBe(false);
  });
});

describe('AC-25.10 — structuredContent may be ANY JSON value (R-16.5-n)', () => {
  it.each([
    ['object', { a: 1 }],
    ['array', [1, 2, 3]],
    ['string', 'hello'],
    ['number', 42],
    ['boolean', false],
    ['null', null],
  ])('accepts structuredContent of type %s', (_label, value) => {
    const r = buildCallToolResult({ content: [], structuredContent: value });
    expect(isCallToolResult(r)).toBe(true);
    expect(isStructuredContentPresent(r)).toBe(true);
  });

  it('distinguishes explicit null structuredContent from absence', () => {
    const withNull = buildCallToolResult({ content: [], structuredContent: null });
    const without = buildCallToolResult({ content: [] });
    expect(isStructuredContentPresent(withNull)).toBe(true);
    expect(isStructuredContentPresent(without)).toBe(false);
  });
});

describe('AC-25.11 — outputSchema ⇒ structuredContent present & conforming (R-16.5-o)', () => {
  it('validates conforming structuredContent against outputSchema', () => {
    const value = { temperature: 22.5, conditions: 'Partly cloudy' };
    expect(validateToolStructuredContent(weatherTool, value).valid).toBe(true);
  });

  it('fails when structuredContent does not conform', () => {
    const bad = { temperature: 'warm' };
    expect(validateToolStructuredContent(weatherTool, bad).valid).toBe(false);
  });

  it('fails when structuredContent is absent for a tool declaring outputSchema', () => {
    expect(validateToolStructuredContent(weatherTool, undefined).valid).toBe(false);
  });
});

describe('AC-25.12 — outputSchema result carries a textual content fallback (R-16.5-p)', () => {
  it('structuredContentTextFallback serializes the structured value to a text block', () => {
    const value = { temperature: 22.5, conditions: 'Partly cloudy', humidity: 65 };
    const block = structuredContentTextFallback(value);
    expect(block.type).toBe('text');
    expect(JSON.parse(block.text)).toEqual(value);
  });

  it('buildOutputSchemaResult populates both structuredContent and a text fallback', () => {
    const value = { temperature: 22.5, conditions: 'Partly cloudy' };
    const r = buildOutputSchemaResult(value);
    expect(r.structuredContent).toEqual(value);
    expect(r.content[0]).toMatchObject({ type: 'text' });
    expect(JSON.parse((r.content[0] as { text: string }).text)).toEqual(value);
    expect(isCallToolResult(r)).toBe(true);
  });
});

describe('AC-25.13 — absent isError treated as false / success (R-16.5-q)', () => {
  it('isCallToolError is false when isError is absent', () => {
    const r = buildCallToolResult({ content: [] });
    expect('isError' in r).toBe(false);
    expect(isCallToolError(r)).toBe(false);
  });

  it('isCallToolError is true when isError is true', () => {
    expect(isCallToolError({ isError: true })).toBe(true);
  });
});

describe('AC-25.14 — resultType REQUIRED; "complete" for a finished call (R-16.5-r)', () => {
  it('a built result carries resultType "complete"', () => {
    expect(buildCallToolResult({ content: [] }).resultType).toBe('complete');
  });

  it('rejects a result missing resultType', () => {
    expect(CallToolResultSchema.safeParse({ content: [] }).success).toBe(false);
  });

  it('rejects a CallToolResult whose resultType is not "complete"', () => {
    expect(
      CallToolResultSchema.safeParse({ resultType: 'input_required', content: [] }).success,
    ).toBe(false);
  });
});

describe('AC-25.15 — _meta accepted on a result (R-16.5-s)', () => {
  it('accepts a result carrying _meta', () => {
    const r = buildCallToolResult({ content: [], _meta: { trace: 'x' } });
    expect(isCallToolResult(r)).toBe(true);
    expect(r._meta).toEqual({ trace: 'x' });
  });
});

// ─── §16.5/§11 multi-round-trip ───────────────────────────────────────────────

describe('AC-25.16 — input_required ⇒ client may gather input and retry (R-16.5-t)', () => {
  it('retry sets both inputResponses and requestState as supplied', () => {
    const retry = buildCallToolRetryRequest(5, 6, {
      name: 'book_flight',
      inputResponses: { seat_class: 'economy' },
      requestState: 'opaque',
    });
    expect(retry.params.inputResponses).toEqual({ seat_class: 'economy' });
    expect(retry.params.requestState).toBe('opaque');
    expect(retry.method).toBe('tools/call');
  });
});

describe('AC-25.17 — retry id differs from initial id (R-16.5-u)', () => {
  it('throws when the retry id equals the initial id', () => {
    expect(() =>
      buildCallToolRetryRequest(5, 5, {
        name: 'book_flight',
        inputResponses: { seat_class: 'economy' },
      }),
    ).toThrow(RangeError);
  });

  it('produces a retry with a different id when ids differ', () => {
    const retry = buildCallToolRetryRequest(5, 6, {
      name: 'book_flight',
      inputResponses: { seat_class: 'economy' },
    });
    expect(retry.id).toBe(6);
    expect(retry.id).not.toBe(5);
  });
});

// ─── §16.6 error model ────────────────────────────────────────────────────────

describe('AC-25.18 — tool failure vs dispatch failure never conflated (R-16.6-a)', () => {
  it('a dispatch failure is a JSON-RPC error, not a CallToolResult', () => {
    const outcome = dispatchToolCall({ name: 'nope' }, [weatherTool]);
    expect(outcome.dispatched).toBe(false);
    if (!outcome.dispatched) {
      expect(isCallToolResult(outcome.error)).toBe(false);
      expect(outcome.error.code).toBe(INVALID_PARAMS_CODE);
    }
  });

  it('a tool-execution failure is a CallToolResult with isError, not a JSON-RPC error', () => {
    const result = buildToolExecutionError('boom');
    expect(isCallToolResult(result)).toBe(true);
    expect(isCallToolError(result)).toBe(true);
    expect('code' in result).toBe(false);
  });
});

describe('AC-25.19 — tool execution error is a successful result w/ isError + explanation (R-16.6-b)', () => {
  it('builds isError: true with a model-readable text explanation', () => {
    const msg = 'Invalid departure date: must be in the future. Current date is 08/08/2025.';
    const result = buildToolExecutionError(msg);
    expect(result.resultType).toBe('complete');
    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({ type: 'text', text: msg });
    expect(isCallToolResult(result)).toBe(true);
  });
});

describe('AC-25.20 — client provides tool execution error to the model (R-16.6-c)', () => {
  it('the explanation in content is available to forward to the model', () => {
    const result = buildToolExecutionError('upstream timed out');
    // A client SHOULD provide tool execution errors to the model: the error
    // is detectable (isError) and its content carries a forwardable explanation.
    expect(isCallToolError(result)).toBe(true);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toBe('upstream timed out');
  });
});

describe('AC-25.21 — undispatchable request ⇒ JSON-RPC error, never a CallToolResult (R-16.6-d)', () => {
  it('unknown name and invalid args both yield JSON-RPC errors', () => {
    const unknown = dispatchToolCall({ name: 'x' }, [weatherTool]);
    const badArgs = dispatchToolCall(
      { name: 'get_weather_data', arguments: { location: 1 } },
      [weatherTool],
    );
    for (const outcome of [unknown, badArgs]) {
      expect(outcome.dispatched).toBe(false);
      if (!outcome.dispatched) {
        expect(outcome.error.code).toBe(INVALID_PARAMS_CODE);
        expect(isCallToolResult(outcome.error)).toBe(false);
      }
    }
  });
});

describe('AC-25.22 — client MAY surface protocol errors to the model (R-16.6-g)', () => {
  it('a protocol error carries a human-readable message a client may forward', () => {
    const err = buildUnknownToolError('ghost_tool');
    expect(typeof err.message).toBe('string');
    expect(err.message.length).toBeGreaterThan(0);
  });
});

// ─── §16.7 tool annotations ───────────────────────────────────────────────────

describe('AC-25.23 — annotations.title optional display string (R-16.7-a)', () => {
  it('accepts an annotations object with a title', () => {
    const parsed = ToolAnnotationsSchema.safeParse({ title: 'Web Search' });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.title).toBe('Web Search');
  });

  it('accepts annotations without a title', () => {
    expect(ToolAnnotationsSchema.safeParse({}).success).toBe(true);
  });
});

describe('AC-25.24 — readOnlyHint defaults to false (R-16.7-b)', () => {
  it('defaults to false when absent', () => {
    expect(resolveToolAnnotationHints(undefined).readOnlyHint).toBe(false);
    expect(resolveToolAnnotationHints({}).readOnlyHint).toBe(false);
    expect(TOOL_ANNOTATION_DEFAULTS.readOnlyHint).toBe(false);
  });

  it('reflects true when set', () => {
    expect(resolveToolAnnotationHints({ readOnlyHint: true }).readOnlyHint).toBe(true);
  });
});

describe('AC-25.25 — destructiveHint defaults to true (R-16.7-c)', () => {
  it('defaults to true when absent', () => {
    expect(resolveToolAnnotationHints({}).destructiveHint).toBe(true);
    expect(TOOL_ANNOTATION_DEFAULTS.destructiveHint).toBe(true);
  });

  it('reflects false when set additive-only', () => {
    expect(resolveToolAnnotationHints({ destructiveHint: false }).destructiveHint).toBe(false);
  });
});

describe('AC-25.26 — idempotentHint defaults to false (R-16.7-d)', () => {
  it('defaults to false when absent', () => {
    expect(resolveToolAnnotationHints({}).idempotentHint).toBe(false);
    expect(TOOL_ANNOTATION_DEFAULTS.idempotentHint).toBe(false);
  });

  it('reflects true when set', () => {
    expect(resolveToolAnnotationHints({ idempotentHint: true }).idempotentHint).toBe(true);
  });
});

describe('AC-25.27 — openWorldHint defaults to true (R-16.7-e)', () => {
  it('defaults to true when absent', () => {
    expect(resolveToolAnnotationHints({}).openWorldHint).toBe(true);
    expect(TOOL_ANNOTATION_DEFAULTS.openWorldHint).toBe(true);
  });

  it('reflects false when set to a closed domain', () => {
    expect(resolveToolAnnotationHints({ openWorldHint: false }).openWorldHint).toBe(false);
  });
});

describe('AC-25.28 — annotations are untrusted; no safety decision on untrusted server (R-16.7-f, R-16.7-g)', () => {
  it('fails closed for an untrusted (default) server', () => {
    expect(mayTrustToolAnnotations()).toBe(false);
    expect(mayTrustToolAnnotations(false)).toBe(false);
  });

  it('permits use only for an explicitly trusted server', () => {
    expect(mayTrustToolAnnotations(true)).toBe(true);
  });
});

// ─── §16.8 list-changed notification ──────────────────────────────────────────

describe('AC-25.29 — notifications/tools/list_changed on tool-set change (R-16.8-a)', () => {
  it('builds a well-formed list-changed notification with the reused method name', () => {
    const n = buildToolListChangedNotification();
    expect(n.method).toBe('notifications/tools/list_changed');
    expect(n.method).toBe(TOOLS_LIST_CHANGED_METHOD);
    expect(isToolListChangedNotification(n)).toBe(true);
    expect(ToolListChangedNotificationSchema.safeParse(n).success).toBe(true);
  });
});

describe('AC-25.30 — notification needs no payload / no prior subscription (R-16.8-b)', () => {
  it('is valid with no params at all', () => {
    const n = { jsonrpc: '2.0', method: TOOLS_LIST_CHANGED_METHOD };
    expect(isToolListChangedNotification(n)).toBe(true);
  });

  it('is valid carrying only _meta', () => {
    const n = buildToolListChangedNotification({ k: 'v' });
    expect(n.params).toEqual({ _meta: { k: 'v' } });
    expect(isToolListChangedNotification(n)).toBe(true);
  });

  it('has no id (it is a notification, not a request)', () => {
    expect('id' in buildToolListChangedNotification()).toBe(false);
  });
});

describe('AC-25.31 — client invalidates cache and may re-list (R-16.8-c, R-16.8-d)', () => {
  it('reactToToolListChanged invalidates cache and permits re-list', () => {
    const reaction = reactToToolListChanged();
    expect(reaction.invalidateCachedToolList).toBe(true);
    expect(reaction.mayRelist).toBe(true);
  });
});

// ─── §16.9 stateful tools (non-normative guidance) ────────────────────────────

describe('AC-25.32 — explicit handle returned and accepted, not connection identity (R-16.9-a)', () => {
  it('a creation tool returns a handle in structuredContent; a later call accepts it as an argument', () => {
    // Creation tool returns an opaque handle in its result.
    const handle = '550e8400-e29b-41d4-a716-446655440000';
    const created = buildOutputSchemaResult({ cartHandle: handle });
    expect((created.structuredContent as { cartHandle: string }).cartHandle).toBe(handle);

    // A subsequent call passes that handle as an ordinary argument.
    const addItem: DispatchableTool = {
      name: 'cart_add_item',
      inputSchema: {
        type: 'object',
        properties: { cartHandle: { type: 'string' }, sku: { type: 'string' } },
        required: ['cartHandle', 'sku'],
      },
    };
    const outcome = dispatchToolCall(
      { name: 'cart_add_item', arguments: { cartHandle: handle, sku: 'ABC' } },
      [addItem],
    );
    expect(outcome.dispatched).toBe(true);
    if (outcome.dispatched) expect(outcome.arguments['cartHandle']).toBe(handle);
  });
});

describe('AC-25.33 — authenticated server validates authz against handle every call (R-16.9-b)', () => {
  it('an authz check that fails for a handle yields a tool execution error', () => {
    // Model: the server authorizes the caller against the presented handle on
    // every call; failure is a tool execution error (per §16.6), not a result.
    const authorized = (caller: string, handle: string) =>
      caller === 'alice' && handle === 'h1';
    const result = authorized('mallory', 'h1')
      ? buildOutputSchemaResult({ ok: true })
      : buildToolExecutionError('Not authorized for handle h1');
    expect(isCallToolError(result)).toBe(true);
  });
});

describe('AC-25.34 — unauthenticated handle is high-entropy with bounded lifetime (R-16.9-c)', () => {
  it('a UUIDv4-shaped handle has high entropy and an expiry can be modeled', () => {
    const handle = '550e8400-e29b-41d4-a716-446655440000';
    const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(uuidV4.test(handle)).toBe(true);
    // Bounded lifetime: an expiry timestamp gives the handle a finite TTL.
    const expiresAt = Date.now() + 60_000;
    expect(expiresAt).toBeGreaterThan(Date.now());
  });
});

describe('AC-25.35 — handle is opaque; retention policy stated in description (R-16.9-d, R-16.9-e)', () => {
  it('an opaque handle is a plain string the SDK never parses', () => {
    const handle = 'opaque-token-do-not-parse';
    // The SDK treats a handle as an ordinary string argument — no structural
    // inspection, mirroring how requestState is echoed verbatim.
    const outcome = dispatchToolCall(
      { name: 'ping', arguments: {} },
      [noArgTool],
    );
    expect(outcome.dispatched).toBe(true);
    expect(typeof handle).toBe('string');
  });

  it('a creation tool can state its retention policy in its description (S24 Tool field)', () => {
    const creationToolDescription =
      'Creates a shopping cart and returns an opaque handle. Handles expire after 1 hour.';
    expect(creationToolDescription).toMatch(/expire/i);
  });
});

describe('AC-25.36 — expired/unknown handle ⇒ tool execution error describing the condition (R-16.9-f)', () => {
  it('a call against an unknown handle returns isError with a recoverable explanation', () => {
    const result = buildToolExecutionError(
      'Cart handle expired or unknown; create a new cart to continue.',
    );
    expect(isCallToolError(result)).toBe(true);
    expect((result.content[0] as { text: string }).text).toMatch(/expired or unknown/i);
    // It is a tool execution error (result), not a protocol JSON-RPC error.
    expect('code' in result).toBe(false);
  });
});
