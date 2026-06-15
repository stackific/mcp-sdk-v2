/**
 * Tests for S17 — Multi-Round-Trip Requests (§11).
 *
 * AC coverage:
 *  AC-17.1  (R-11.1-a,b)  — solicitation only via input_required result
 *  AC-17.2  (R-11.1-c)    — no assumption that usable retry will arrive
 *  AC-17.3  (R-11.2-a)    — resultType="input_required" is required
 *  AC-17.4  (R-11.2-b)    — at least one of inputRequests/requestState present
 *  AC-17.5  (R-11.2-c)    — both absent → malformed error
 *  AC-17.6  (R-11.2-d)    — server may use any non-empty string key
 *  AC-17.7  (R-11.2-e,f,g) — keys unique in inputRequests
 *  AC-17.8  (R-11.2-h, R-11.4-c,d) — inputResponses keys match inputRequests keys
 *  AC-17.9  (R-11.2-i)    — prefer alternatives to deprecated kinds
 *  AC-17.10 (R-11.2-j, R-11.5-g,h) — server must not emit unsupported kind
 *  AC-17.11 (R-11.2-k,l)  — unrecognized method → error
 *  AC-17.12 (R-11.3-a,b,f) — requestState is opaque (no parse/modify)
 *  AC-17.13 (R-11.3-c, R-11.4-g) — requestState echoed verbatim
 *  AC-17.14 (R-11.3-d,e)  — server may encode or use as handle
 *  AC-17.15 (R-11.3-g)    — server protects sensitive requestState
 *  AC-17.16 (R-11.3-h,i)  — server validates requestState on retry
 *  AC-17.17 (R-11.4-a)    — any request MAY carry inputResponses+requestState
 *  AC-17.18 (R-11.4-b)    — retry: same method, new id
 *  AC-17.19 (R-11.4-e,f)  — inputResponse kind matches inputRequest kind
 *  AC-17.20 (R-11.4-h)    — another InputRequiredResult on retry is valid
 *  AC-17.21 (R-11.4-i,j)  — scoping: not attached to other requests
 *  AC-17.22 (R-11.5-a)    — client fulfills only declared-capability kinds
 *  AC-17.23 (R-11.5-b)    — no protocol round limit; guard against unbounded loops
 *  AC-17.24 (R-11.5-c,d,e,f, R-11.6-c) — discriminateResultType behavior
 *  AC-17.25 (R-11.5-i,j)  — missing capability → -32003 + HTTP 400
 *  AC-17.26 (R-11.5-k)    — undeclared kind received → error
 *  AC-17.27 (R-11.5-l)    — load-shedding: no inputRequests, only requestState
 *  AC-17.28 (R-11.5-m–p)  — load-shedding handling
 *  AC-17.29 (R-11.5-q,r)  — incomplete inputResponses: re-request or ignore
 *  AC-17.30 (R-11.5-s)    — protocol-level malformed response → JSON-RPC error
 *  AC-17.31 (R-11.6-a,b)  — participating methods
 */

import { describe, it, expect } from 'vitest';
import {
  InputRequiredResultSchema,
  InputResponseRequestParamsSchema,
  RECOGNIZED_INPUT_REQUEST_METHODS,
  isRecognizedInputRequestMethod,
  isInputRequiredResult,
  isLoadSheddingResult,
  discriminateResultType,
  validateInputResponseKeys,
  validateInputResponseKinds,
  buildMissingCapabilityForMrtrError,
  buildMalformedRetryError,
  validateRetryParams,
  isMrtrParticipatingMethod,
  MRTR_PARTICIPATING_METHODS,
  MALFORMED_INPUT_REQUIRED_RESULT_ERROR,
  RESULT_TYPE,
  ElicitResultSchema,
  ListRootsResultSchema,
  CreateMessageResultSchema,
  INPUT_RESPONSE_SCHEMA_BY_METHOD,
} from '../../protocol/multi-round-trip.js';

// ─── AC-17.3 — resultType="input_required" required (R-11.2-a) ───────────────

describe('InputRequiredResultSchema — resultType required (AC-17.3 · R-11.2-a)', () => {
  it('accepts a valid InputRequiredResult with requestState only', () => {
    const result = InputRequiredResultSchema.safeParse({
      resultType: 'input_required',
      requestState: 'opaque-token',
    });
    expect(result.success).toBe(true);
  });

  it('rejects when resultType is "complete"', () => {
    const result = InputRequiredResultSchema.safeParse({
      resultType: 'complete',
      requestState: 'token',
    });
    expect(result.success).toBe(false);
  });

  it('rejects when resultType is absent', () => {
    const result = InputRequiredResultSchema.safeParse({
      requestState: 'token',
    });
    expect(result.success).toBe(false);
  });

  it('rejects wrong casing "Input_Required"', () => {
    const result = InputRequiredResultSchema.safeParse({
      resultType: 'Input_Required',
      requestState: 'token',
    });
    expect(result.success).toBe(false);
  });

  it('RESULT_TYPE.INPUT_REQUIRED equals "input_required"', () => {
    expect(RESULT_TYPE.INPUT_REQUIRED).toBe('input_required');
  });
});

// ─── AC-17.4 — at least one of inputRequests/requestState (R-11.2-b) ─────────

describe('InputRequiredResultSchema — at least one field (AC-17.4 · R-11.2-b)', () => {
  it('accepts with inputRequests only', () => {
    const result = InputRequiredResultSchema.safeParse({
      resultType: 'input_required',
      inputRequests: {
        'ask-user': { method: 'elicitation/create', params: { message: 'Name?' } },
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts with requestState only (load-shedding path)', () => {
    const result = InputRequiredResultSchema.safeParse({
      resultType: 'input_required',
      requestState: 'tok',
    });
    expect(result.success).toBe(true);
  });

  it('accepts with both inputRequests and requestState', () => {
    const result = InputRequiredResultSchema.safeParse({
      resultType: 'input_required',
      inputRequests: { key: { method: 'elicitation/create', params: {} } },
      requestState: 'tok',
    });
    expect(result.success).toBe(true);
  });
});

// ─── AC-17.5 — both absent → malformed (R-11.2-c) ────────────────────────────

describe('InputRequiredResultSchema — both absent → error (AC-17.5 · R-11.2-c)', () => {
  it('rejects when both inputRequests and requestState are absent', () => {
    const result = InputRequiredResultSchema.safeParse({
      resultType: 'input_required',
    });
    expect(result.success).toBe(false);
  });

  it('MALFORMED_INPUT_REQUIRED_RESULT_ERROR code is -32602', () => {
    expect(MALFORMED_INPUT_REQUIRED_RESULT_ERROR.code).toBe(-32602);
  });
});

// ─── AC-17.6 — any non-empty string key (R-11.2-d) ───────────────────────────

describe('inputRequests keys (AC-17.6 · R-11.2-d)', () => {
  it('accepts arbitrary string keys', () => {
    const result = InputRequiredResultSchema.safeParse({
      resultType: 'input_required',
      inputRequests: {
        'github-username': { method: 'elicitation/create', params: {} },
        step2: { method: 'elicitation/create', params: {} },
      },
      requestState: 'tok',
    });
    expect(result.success).toBe(true);
  });
});

// ─── AC-17.11 — unrecognized input-request method → error (R-11.2-k,l) ───────

describe('Recognized input-request methods (AC-17.11 · R-11.2-k, R-11.2-l)', () => {
  it('RECOGNIZED_INPUT_REQUEST_METHODS contains the three known methods', () => {
    expect(RECOGNIZED_INPUT_REQUEST_METHODS.has('elicitation/create')).toBe(true);
    expect(RECOGNIZED_INPUT_REQUEST_METHODS.has('roots/list')).toBe(true);
    expect(RECOGNIZED_INPUT_REQUEST_METHODS.has('sampling/createMessage')).toBe(true);
  });

  it('isRecognizedInputRequestMethod returns true for all three', () => {
    expect(isRecognizedInputRequestMethod('elicitation/create')).toBe(true);
    expect(isRecognizedInputRequestMethod('roots/list')).toBe(true);
    expect(isRecognizedInputRequestMethod('sampling/createMessage')).toBe(true);
  });

  it('isRecognizedInputRequestMethod returns false for an unknown method', () => {
    expect(isRecognizedInputRequestMethod('unknown/method')).toBe(false);
    expect(isRecognizedInputRequestMethod('tools/call')).toBe(false);
  });

  it('InputRequiredResultSchema rejects an inputRequests entry with unknown method', () => {
    const result = InputRequiredResultSchema.safeParse({
      resultType: 'input_required',
      inputRequests: {
        'step': { method: 'unknown/getInput', params: {} },
      },
    });
    // The discriminated union on `method` should reject unrecognized methods
    expect(result.success).toBe(false);
  });
});

// ─── AC-17.12 — requestState is opaque (R-11.3-a,b,f) ───────────────────────

describe('requestState opaqueness (AC-17.12 · R-11.3-a, R-11.3-b, R-11.3-f)', () => {
  it('accepts any string as requestState (opaque, no format enforced)', () => {
    const cases = [
      'simple-token',
      'eyJzdGVwIjoiYXdhaXQiLCJzaWciOiJhYmMifQ==',
      '{"step":"await"}', // even looks like JSON — still opaque
      '',
    ];
    for (const requestState of cases) {
      const result = InputRequiredResultSchema.safeParse({
        resultType: 'input_required',
        requestState,
      });
      expect(result.success).toBe(true);
    }
  });
});

// ─── AC-17.17 — any request MAY carry inputResponses+requestState (R-11.4-a) ──

describe('InputResponseRequestParamsSchema (AC-17.17 · R-11.4-a)', () => {
  it('accepts params with only _meta (no inputResponses or requestState)', () => {
    const result = InputResponseRequestParamsSchema.safeParse({
      _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts params with inputResponses and requestState on a retry', () => {
    const result = InputResponseRequestParamsSchema.safeParse({
      _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' },
      inputResponses: {
        'step1': { action: 'accept', content: { name: 'octocat' } },
      },
      requestState: 'opaque-state-tok',
    });
    expect(result.success).toBe(true);
  });

  it('accepts params with only requestState (load-shedding retry)', () => {
    const result = InputResponseRequestParamsSchema.safeParse({
      _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' },
      requestState: 'opaque',
    });
    expect(result.success).toBe(true);
  });
});

// ─── AC-17.8 — validateInputResponseKeys (R-11.2-h, R-11.4-c,d) ─────────────

describe('validateInputResponseKeys (AC-17.8 · R-11.2-h, R-11.4-c, R-11.4-d)', () => {
  it('returns valid when all inputResponse keys match inputRequest keys', () => {
    const result = validateInputResponseKeys(
      { 'ask-name': {}, 'ask-repo': {} },
      { 'ask-name': { action: 'accept' }, 'ask-repo': { action: 'accept' } },
    );
    expect(result.valid).toBe(true);
    expect(result.unknownKeys).toHaveLength(0);
  });

  it('returns valid when only a subset of inputRequest keys are answered', () => {
    // Server should ignore unanswered keys, and client may answer a subset
    const result = validateInputResponseKeys(
      { 'key-a': {}, 'key-b': {} },
      { 'key-a': { action: 'accept' } }, // key-b not answered
    );
    expect(result.valid).toBe(true);
  });

  it('returns invalid when inputResponse contains a key not in inputRequests', () => {
    const result = validateInputResponseKeys(
      { 'key-a': {} },
      { 'key-a': { action: 'accept' }, 'key-z': { action: 'decline' } }, // key-z not in requests
    );
    expect(result.valid).toBe(false);
    expect(result.unknownKeys).toContain('key-z');
  });

  it('returns valid when inputResponses is empty', () => {
    const result = validateInputResponseKeys({ 'key-a': {} }, {});
    expect(result.valid).toBe(true);
  });
});

// ─── isInputRequiredResult ────────────────────────────────────────────────────

describe('isInputRequiredResult type guard', () => {
  it('returns true for a well-formed InputRequiredResult', () => {
    expect(
      isInputRequiredResult({
        resultType: 'input_required',
        requestState: 'tok',
      }),
    ).toBe(true);
  });

  it('returns false for a complete result', () => {
    expect(isInputRequiredResult({ resultType: 'complete' })).toBe(false);
  });

  it('returns false for an object missing both inputRequests and requestState', () => {
    expect(isInputRequiredResult({ resultType: 'input_required' })).toBe(false);
  });
});

// ─── AC-17.27 — isLoadSheddingResult (R-11.5-l) ──────────────────────────────

describe('isLoadSheddingResult (AC-17.27 · R-11.5-l)', () => {
  it('returns true for a load-shedding result (no inputRequests, only requestState)', () => {
    expect(
      isLoadSheddingResult({
        resultType: 'input_required',
        requestState: 'tok',
      }),
    ).toBe(true);
  });

  it('returns true when inputRequests is absent and requestState is present', () => {
    expect(
      isLoadSheddingResult({ resultType: 'input_required', requestState: 'state' }),
    ).toBe(true);
  });

  it('returns false when inputRequests is non-empty', () => {
    expect(
      isLoadSheddingResult({
        resultType: 'input_required',
        inputRequests: { step: { method: 'elicitation/create', params: {} } },
        requestState: 'tok',
      }),
    ).toBe(false);
  });

  it('returns false for a complete result', () => {
    expect(isLoadSheddingResult({ resultType: 'complete' })).toBe(false);
  });

  it('returns false when requestState is absent (even with absent inputRequests — malformed)', () => {
    expect(isLoadSheddingResult({ resultType: 'input_required' })).toBe(false);
  });
});

// ─── AC-17.24 — discriminateResultType (R-11.5-c,d,e,f, R-11.6-c) ───────────

describe('discriminateResultType (AC-17.24 · R-11.5-c,d,e,f, R-11.6-c)', () => {
  it('"complete" → action: "complete"', () => {
    const disc = discriminateResultType({ resultType: 'complete' });
    expect(disc.action).toBe('complete');
  });

  it('absent resultType → treated as "complete" (R-11.5-f)', () => {
    const disc = discriminateResultType({ content: [] });
    expect(disc.action).toBe('complete');
  });

  it('null resultType → action: "complete" (treated as absent)', () => {
    const disc = discriminateResultType({ resultType: null });
    expect(disc.action).toBe('complete');
  });

  it('"input_required" with valid shape → action: "input_required"', () => {
    const disc = discriminateResultType({
      resultType: 'input_required',
      requestState: 'tok',
    });
    expect(disc.action).toBe('input_required');
  });

  it('"input_required" with invalid shape (no inputRequests/requestState) → action: "error"', () => {
    const disc = discriminateResultType({ resultType: 'input_required' });
    expect(disc.action).toBe('error');
  });

  it('unrecognized resultType → action: "error" (R-11.5-d)', () => {
    const disc = discriminateResultType({ resultType: 'pending' });
    expect(disc.action).toBe('error');
  });

  it('non-string resultType → action: "error" (R-11.5-d)', () => {
    const disc = discriminateResultType({ resultType: 42 });
    expect(disc.action).toBe('error');
  });

  it('non-object result → action: "error"', () => {
    const disc = discriminateResultType('not-an-object');
    expect(disc.action).toBe('error');
  });
});

// ─── AC-17.25 — missing-capability error (R-11.5-i,j) ───────────────────────

describe('buildMissingCapabilityForMrtrError (AC-17.25 · R-11.5-i, R-11.5-j)', () => {
  it('returns code -32003', () => {
    const error = buildMissingCapabilityForMrtrError({ elicitation: {} });
    expect(error.code).toBe(-32003);
  });

  it('includes requiredCapabilities in data', () => {
    const caps = { elicitation: {}, sampling: {} };
    const error = buildMissingCapabilityForMrtrError(caps);
    expect(error.data.requiredCapabilities).toEqual(caps);
  });

  it('has a non-empty human-readable message', () => {
    const error = buildMissingCapabilityForMrtrError({});
    expect(typeof error.message).toBe('string');
    expect(error.message.length).toBeGreaterThan(0);
  });
});

// ─── AC-17.31 — participating methods (R-11.6-a,b) ──────────────────────────

describe('MRTR_PARTICIPATING_METHODS (AC-17.31 · R-11.6-a, R-11.6-b)', () => {
  it('contains tools/call, prompts/get, resources/read', () => {
    expect(MRTR_PARTICIPATING_METHODS.has('tools/call')).toBe(true);
    expect(MRTR_PARTICIPATING_METHODS.has('prompts/get')).toBe(true);
    expect(MRTR_PARTICIPATING_METHODS.has('resources/read')).toBe(true);
  });

  it('isMrtrParticipatingMethod returns true for the three methods', () => {
    expect(isMrtrParticipatingMethod('tools/call')).toBe(true);
    expect(isMrtrParticipatingMethod('prompts/get')).toBe(true);
    expect(isMrtrParticipatingMethod('resources/read')).toBe(true);
  });

  it('isMrtrParticipatingMethod returns false for other methods', () => {
    expect(isMrtrParticipatingMethod('tools/list')).toBe(false);
    expect(isMrtrParticipatingMethod('server/discover')).toBe(false);
  });
});

// ─── InputRequiredResult round-trip with full inputRequests ──────────────────

describe('InputRequiredResult with all three input-request kinds', () => {
  it('accepts elicitation/create', () => {
    const result = InputRequiredResultSchema.safeParse({
      resultType: 'input_required',
      inputRequests: {
        'ask-user': {
          method: 'elicitation/create',
          params: {
            mode: 'form',
            message: 'Please provide your name',
            requestedSchema: { type: 'object', properties: { name: { type: 'string' } } },
          },
        },
      },
      requestState: 'eyJzdGVwIjoiMSJ9',
    });
    expect(result.success).toBe(true);
  });

  it('accepts roots/list without params', () => {
    const result = InputRequiredResultSchema.safeParse({
      resultType: 'input_required',
      inputRequests: {
        'get-roots': { method: 'roots/list' },
      },
      requestState: 'tok',
    });
    expect(result.success).toBe(true);
  });

  it('accepts sampling/createMessage', () => {
    const result = InputRequiredResultSchema.safeParse({
      resultType: 'input_required',
      inputRequests: {
        'llm-step': {
          method: 'sampling/createMessage',
          params: { messages: [], modelPreferences: {} },
        },
      },
      requestState: 'tok',
    });
    expect(result.success).toBe(true);
  });
});

// ─── AC-17.19 — forward-declared InputResponse schemas (R-11.4-e) ─────────────

describe('ElicitResultSchema (AC-17.19 · R-11.4-e)', () => {
  it('accepts a well-formed ElicitResult with action "accept"', () => {
    const result = ElicitResultSchema.safeParse({
      action: 'accept',
      content: { name: 'octocat' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts action "decline" without content', () => {
    const result = ElicitResultSchema.safeParse({ action: 'decline' });
    expect(result.success).toBe(true);
  });

  it('accepts action "cancel"', () => {
    const result = ElicitResultSchema.safeParse({ action: 'cancel' });
    expect(result.success).toBe(true);
  });

  it('rejects when action is missing', () => {
    const result = ElicitResultSchema.safeParse({ content: { name: 'x' } });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown action string', () => {
    const result = ElicitResultSchema.safeParse({ action: 'defer' });
    expect(result.success).toBe(false);
  });
});

describe('ListRootsResultSchema (AC-17.19 · R-11.4-e)', () => {
  it('accepts a well-formed ListRootsResult', () => {
    const result = ListRootsResultSchema.safeParse({
      roots: [{ uri: 'file:///home/user', name: 'home' }],
    });
    expect(result.success).toBe(true);
  });

  it('accepts an empty roots array', () => {
    const result = ListRootsResultSchema.safeParse({ roots: [] });
    expect(result.success).toBe(true);
  });

  it('rejects when roots is missing', () => {
    const result = ListRootsResultSchema.safeParse({ other: 'value' });
    expect(result.success).toBe(false);
  });

  it('rejects when a root entry is missing uri', () => {
    const result = ListRootsResultSchema.safeParse({
      roots: [{ name: 'no-uri' }],
    });
    expect(result.success).toBe(false);
  });
});

describe('CreateMessageResultSchema (AC-17.19 · R-11.4-e)', () => {
  it('accepts a well-formed CreateMessageResult', () => {
    const result = CreateMessageResultSchema.safeParse({
      role: 'assistant',
      content: { type: 'text', text: 'Hello' },
      model: 'claude-haiku-4-5',
    });
    expect(result.success).toBe(true);
  });

  it('rejects when role is missing', () => {
    const result = CreateMessageResultSchema.safeParse({
      content: { type: 'text', text: 'Hello' },
      model: 'claude-haiku-4-5',
    });
    expect(result.success).toBe(false);
  });

  it('rejects when model is missing', () => {
    const result = CreateMessageResultSchema.safeParse({
      role: 'assistant',
      content: { type: 'text', text: 'Hello' },
    });
    expect(result.success).toBe(false);
  });
});

describe('INPUT_RESPONSE_SCHEMA_BY_METHOD', () => {
  it('has entries for all three recognized methods', () => {
    expect(INPUT_RESPONSE_SCHEMA_BY_METHOD['elicitation/create']).toBeDefined();
    expect(INPUT_RESPONSE_SCHEMA_BY_METHOD['roots/list']).toBeDefined();
    expect(INPUT_RESPONSE_SCHEMA_BY_METHOD['sampling/createMessage']).toBeDefined();
  });
});

// ─── AC-17.19 — validateInputResponseKinds (RQ-13, R-11.4-e,f) ───────────────

describe('validateInputResponseKinds — kind-correlation (AC-17.19 · RQ-13 · R-11.4-e, R-11.4-f)', () => {
  const requests = {
    'ask-user': { method: 'elicitation/create' as const, params: {} },
    'get-roots': { method: 'roots/list' as const },
    'sample-llm': { method: 'sampling/createMessage' as const, params: {} },
  };

  it('returns valid when all responses match their request kinds', () => {
    const result = validateInputResponseKinds(requests, {
      'ask-user': { action: 'accept', content: { name: 'octocat' } },
      'get-roots': { roots: [{ uri: 'file:///home' }] },
      'sample-llm': { role: 'assistant', content: { type: 'text', text: 'hi' }, model: 'x' },
    });
    expect(result.valid).toBe(true);
  });

  it('returns valid for an empty inputResponses (client answered nothing)', () => {
    const result = validateInputResponseKinds(requests, {});
    expect(result.valid).toBe(true);
  });

  it('returns invalid when an ElicitResult is missing `action`', () => {
    const result = validateInputResponseKinds(
      { 'ask-user': { method: 'elicitation/create', params: {} } },
      { 'ask-user': { content: { name: 'x' } } }, // missing action
    );
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.key).toBe('ask-user');
      expect(result.errors[0]!.expectedMethod).toBe('elicitation/create');
    }
  });

  it('returns invalid when a ListRootsResult is missing `roots`', () => {
    const result = validateInputResponseKinds(
      { 'get-roots': { method: 'roots/list' } },
      { 'get-roots': { noRootsKey: true } },
    );
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0]!.key).toBe('get-roots');
    }
  });

  it('returns invalid when a CreateMessageResult is missing `model`', () => {
    const result = validateInputResponseKinds(
      { 'sample-llm': { method: 'sampling/createMessage', params: {} } },
      { 'sample-llm': { role: 'assistant', content: {} } }, // missing model
    );
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0]!.key).toBe('sample-llm');
      expect(result.errors[0]!.expectedMethod).toBe('sampling/createMessage');
    }
  });

  it('reports multiple errors when multiple responses are malformed', () => {
    const result = validateInputResponseKinds(
      {
        'ask-user': { method: 'elicitation/create', params: {} },
        'sample-llm': { method: 'sampling/createMessage', params: {} },
      },
      {
        'ask-user': { wrong: true },
        'sample-llm': { role: 'assistant' }, // missing content and model
      },
    );
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('skips keys that are not in inputRequests (those are caught by validateInputResponseKeys)', () => {
    // Extra key in inputResponses that has no matching inputRequest — skip silently
    const result = validateInputResponseKinds(
      { 'ask-user': { method: 'elicitation/create', params: {} } },
      {
        'ask-user': { action: 'decline' },
        'unknown-key': { anything: true }, // not in requests — ignored here
      },
    );
    expect(result.valid).toBe(true);
  });
});

// ─── AC-17.30 — buildMalformedRetryError / validateRetryParams (RQ-20, R-11.5-s) ──

describe('buildMalformedRetryError (AC-17.30 · RQ-20 · R-11.5-s)', () => {
  it('returns code -32602', () => {
    const error = buildMalformedRetryError('wrong action field');
    expect(error.code).toBe(-32602);
  });

  it('includes detail in the message', () => {
    const error = buildMalformedRetryError('key "ask-user": missing action');
    expect(error.message).toContain('key "ask-user"');
  });

  it('message is a non-empty string', () => {
    const error = buildMalformedRetryError('some detail');
    expect(typeof error.message).toBe('string');
    expect(error.message.length).toBeGreaterThan(0);
  });
});

describe('validateRetryParams (AC-17.30 · RQ-20 · R-11.5-s)', () => {
  const requests = {
    'ask-user': { method: 'elicitation/create' as const, params: {} },
  };

  it('returns ok:true when all responses are shape-valid', () => {
    const result = validateRetryParams(requests, {
      'ask-user': { action: 'accept', content: { name: 'x' } },
    });
    expect(result.ok).toBe(true);
  });

  it('returns ok:false with a JSON-RPC error when a response is shape-invalid', () => {
    const result = validateRetryParams(requests, {
      'ask-user': { notAction: 'wrong-shape' },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(-32602);
      expect(result.error.message).toContain('ask-user');
    }
  });

  it('error code is exactly -32602, not a different JSON-RPC error code', () => {
    const result = validateRetryParams(
      { 'get-roots': { method: 'roots/list' } },
      { 'get-roots': { wrongShape: true } },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(-32602);
    }
  });

  it('returns ok:true for an empty inputResponses (answers zero questions)', () => {
    const result = validateRetryParams(requests, {});
    expect(result.ok).toBe(true);
  });
});

// ─── Precondition hardening — non-object input must not throw (QA Bucket B #3) ──

describe('validateInputResponseKinds / validateRetryParams — non-object input does not throw', () => {
  const requests = {
    q1: { method: 'elicitation/create', params: {} },
  } as Parameters<typeof validateInputResponseKinds>[0];

  for (const bad of [null, undefined, 42, 'x', [], true] as unknown[]) {
    it(`validateInputResponseKinds tolerates inputResponses = ${JSON.stringify(bad)}`, () => {
      expect(() => validateInputResponseKinds(requests, bad as never)).not.toThrow();
      expect(validateInputResponseKinds(requests, bad as never)).toEqual({ valid: true });
    });

    it(`validateInputResponseKinds tolerates inputRequests = ${JSON.stringify(bad)}`, () => {
      expect(() =>
        validateInputResponseKinds(bad as never, { q1: { action: 'accept' } }),
      ).not.toThrow();
    });

    it(`validateRetryParams tolerates inputResponses = ${JSON.stringify(bad)}`, () => {
      expect(() => validateRetryParams(requests, bad as never)).not.toThrow();
      expect(validateRetryParams(requests, bad as never)).toEqual({ ok: true });
    });
  }
});
