/**
 * S28 — Prompts (§18) tests.
 *
 * Each `describe` block maps to one or more numbered acceptance criteria
 * (AC-28.1 – AC-28.42); the comment on each test names the AC and the atom(s)
 * it exercises.
 */

import { describe, it, expect } from 'vitest';
import {
  PROMPTS_LIST_METHOD,
  PROMPTS_GET_METHOD,
  PROMPTS_LIST_CHANGED_METHOD,
  PROMPTS_INVALID_PARAMS_CODE,
  PROMPTS_INTERNAL_ERROR_CODE,
  PromptsCapabilitySchema,
  serverDeclaresPrompts,
  mayCallPromptMethod,
  mayExpectPromptsListChanged,
  PromptArgumentSchema,
  PromptSchema,
  requiredArgumentNames,
  PromptMessageSchema,
  ListPromptsRequestParamsSchema,
  ListPromptsResultSchema,
  resolveListPromptsResultType,
  buildListPromptsResult,
  GetPromptRequestParamsSchema,
  GetPromptResultSchema,
  resolveGetPromptResultType,
  buildGetPromptResult,
  discriminateGetPromptResponse,
  buildUnknownPromptError,
  buildMissingArgumentError,
  buildPromptInternalError,
  validateGetPromptRequest,
  PromptListChangedNotificationParamsSchema,
  PromptListChangedNotificationSchema,
  buildPromptListChangedNotification,
  mayCompletePromptArgument,
  MRTR_RESULT_TYPE,
  InputRequiredResultSchema,
  type Prompt,
} from '../../protocol/prompts.js';
import { resolveDisplayName } from '../../types/base-metadata.js';

// ─── Shared fixtures ───────────────────────────────────────────────────────────

const CODE_REVIEW_PROMPT: Prompt = {
  name: 'code_review',
  title: 'Request Code Review',
  description: 'Asks the LLM to analyze code quality and suggest improvements',
  arguments: [{ name: 'code', description: 'The code to review', required: true }],
  icons: [{ src: 'https://example.com/review-icon.svg', mimeType: 'image/svg+xml', sizes: ['any'] }],
};

const META = { 'io.modelcontextprotocol/protocolVersion': '2025-11-25' };

// ─── AC-28.1: user-controlled, no required UI ───────────────────────────────────

describe('AC-28.1 user-controlled interaction (R-18-a)', () => {
  it('mandates no specific UI: a prompt is fully usable as plain data, with no slash-command field', () => {
    const parsed = PromptSchema.safeParse(CODE_REVIEW_PROMPT);
    expect(parsed.success).toBe(true);
    // Conformance depends on no UI-pattern field whatsoever.
    expect(Object.keys(parsed.success ? parsed.data : {})).not.toContain('slashCommand');
    expect(Object.keys(parsed.success ? parsed.data : {})).not.toContain('ui');
  });
});

// ─── AC-28.2, AC-28.3: capability declaration & gating ──────────────────────────

describe('AC-28.2 prompts capability declared during negotiation (R-18.1-a)', () => {
  it('serverDeclaresPrompts is true when the prompts key is present', () => {
    expect(serverDeclaresPrompts({ prompts: {} })).toBe(true);
    expect(serverDeclaresPrompts({ prompts: { listChanged: true } })).toBe(true);
  });
});

describe('AC-28.3 client MUST NOT call prompt methods when undeclared (R-18.1-b)', () => {
  it('serverDeclaresPrompts is false when prompts is absent', () => {
    expect(serverDeclaresPrompts({})).toBe(false);
    expect(serverDeclaresPrompts({ tools: {} })).toBe(false);
  });

  it('mayCallPromptMethod gates both prompts/list and prompts/get on the capability', () => {
    expect(mayCallPromptMethod(PROMPTS_LIST_METHOD, {})).toBe(false);
    expect(mayCallPromptMethod(PROMPTS_GET_METHOD, {})).toBe(false);
    expect(mayCallPromptMethod(PROMPTS_LIST_METHOD, { prompts: {} })).toBe(true);
    expect(mayCallPromptMethod(PROMPTS_GET_METHOD, { prompts: {} })).toBe(true);
  });
});

// ─── AC-28.4: listChanged optional, both forms accepted ─────────────────────────

describe('AC-28.4 listChanged sub-flag is OPTIONAL (R-18.1-c)', () => {
  it('accepts the capability with listChanged present', () => {
    expect(PromptsCapabilitySchema.safeParse({ listChanged: true }).success).toBe(true);
    expect(PromptsCapabilitySchema.safeParse({ listChanged: false }).success).toBe(true);
  });

  it('accepts the capability with listChanged absent (bare {})', () => {
    expect(PromptsCapabilitySchema.safeParse({}).success).toBe(true);
  });

  it('rejects a non-boolean listChanged', () => {
    expect(PromptsCapabilitySchema.safeParse({ listChanged: 'yes' }).success).toBe(false);
  });
});

// ─── AC-28.5, AC-28.6: listChanged emit expectation ─────────────────────────────

describe('AC-28.5 listChanged:true permits emitting list_changed (R-18.1-d)', () => {
  it('mayExpectPromptsListChanged is true only when listChanged is exactly true', () => {
    expect(mayExpectPromptsListChanged({ prompts: { listChanged: true } })).toBe(true);
  });
});

describe('AC-28.6 absent/false listChanged ⇒ no expectation (R-18.1-e, R-18.1-f)', () => {
  it('is false when listChanged is absent', () => {
    expect(mayExpectPromptsListChanged({ prompts: {} })).toBe(false);
  });

  it('is false when listChanged is explicitly false', () => {
    expect(mayExpectPromptsListChanged({ prompts: { listChanged: false } })).toBe(false);
  });

  it('is false when prompts is undeclared', () => {
    expect(mayExpectPromptsListChanged({})).toBe(false);
  });
});

// ─── AC-28.7 – AC-28.10: available-set semantics (modeled via list result) ──────

describe('AC-28.7 list responds with currently-available set (R-18.1-g)', () => {
  it('a list result carries the current page of prompts', () => {
    const result = buildListPromptsResult({
      prompts: [CODE_REVIEW_PROMPT],
      ttlMs: 0,
      cacheScope: 'public',
    });
    expect(result.prompts).toHaveLength(1);
    expect(result.prompts[0]?.name).toBe('code_review');
  });
});

describe('AC-28.8 set MAY be empty / change over time (R-18.1-h)', () => {
  it('an empty prompts array is valid', () => {
    const result = buildListPromptsResult({ prompts: [], ttlMs: 0, cacheScope: 'public' });
    expect(ListPromptsResultSchema.safeParse(result).success).toBe(true);
    expect(result.prompts).toEqual([]);
  });

  it('two snapshots may differ (the set may change)', () => {
    const a = buildListPromptsResult({ prompts: [], ttlMs: 0, cacheScope: 'public' });
    const b = buildListPromptsResult({ prompts: [CODE_REVIEW_PROMPT], ttlMs: 0, cacheScope: 'public' });
    expect(a.prompts.length).not.toBe(b.prompts.length);
  });
});

describe('AC-28.9 set does not vary as a side effect of other requests (R-18.1-i)', () => {
  it('building the list from the same input is deterministic, independent of intervening calls', () => {
    const input = { prompts: [CODE_REVIEW_PROMPT], ttlMs: 0, cacheScope: 'public' as const };
    const first = buildListPromptsResult(input);
    buildListPromptsResult({ prompts: [], ttlMs: 0, cacheScope: 'public' }); // intervening unrelated call
    const second = buildListPromptsResult(input);
    expect(second).toEqual(first);
  });
});

describe('AC-28.10 set MAY vary by authorization presented (R-18.1-j)', () => {
  it('different authorization inputs may yield different sets', () => {
    const forScopeA = buildListPromptsResult({ prompts: [CODE_REVIEW_PROMPT], ttlMs: 0, cacheScope: 'private' });
    const forScopeB = buildListPromptsResult({ prompts: [], ttlMs: 0, cacheScope: 'private' });
    expect(forScopeA.prompts).not.toEqual(forScopeB.prompts);
  });
});

// ─── AC-28.11: prompts/list request cursor ──────────────────────────────────────

describe('AC-28.11 prompts/list cursor opaque & optional (R-18.2-a, R-18.2-b, R-18.2-c)', () => {
  it('cursor may be omitted', () => {
    expect(ListPromptsRequestParamsSchema.safeParse({}).success).toBe(true);
  });

  it('a held cursor is carried verbatim (opaque, not constructed)', () => {
    const cursor = 'next-page-cursor';
    const parsed = ListPromptsRequestParamsSchema.parse({ cursor });
    expect(parsed.cursor).toBe(cursor);
  });

  it('the empty string is a valid present cursor (opaque, not parsed)', () => {
    const parsed = ListPromptsRequestParamsSchema.parse({ cursor: '' });
    expect(parsed.cursor).toBe('');
  });
});

// ─── AC-28.12, AC-28.13: ListPromptsResult prompts & nextCursor ─────────────────

describe('AC-28.12 prompts REQUIRED, MAY be empty (R-18.2-d)', () => {
  it('rejects a result missing prompts', () => {
    expect(
      ListPromptsResultSchema.safeParse({ resultType: 'complete', ttlMs: 0, cacheScope: 'public' }).success,
    ).toBe(false);
  });

  it('accepts an empty prompts array', () => {
    expect(
      ListPromptsResultSchema.safeParse({ resultType: 'complete', prompts: [], ttlMs: 0, cacheScope: 'public' })
        .success,
    ).toBe(true);
  });
});

describe('AC-28.13 nextCursor opaque follow-up (R-18.2-e, R-18.2-f, R-18.2-g)', () => {
  it('a present nextCursor is carried verbatim and can be echoed as cursor', () => {
    const result = buildListPromptsResult({
      prompts: [],
      nextCursor: 'next-page-cursor',
      ttlMs: 0,
      cacheScope: 'public',
    });
    expect(result.nextCursor).toBe('next-page-cursor');
    const follow = ListPromptsRequestParamsSchema.parse({ cursor: result.nextCursor });
    expect(follow.cursor).toBe('next-page-cursor');
  });

  it('absent nextCursor means no further pages', () => {
    const result = buildListPromptsResult({ prompts: [], ttlMs: 0, cacheScope: 'public' });
    expect(result.nextCursor).toBeUndefined();
  });
});

// ─── AC-28.14, AC-28.15, AC-28.16: ttlMs ────────────────────────────────────────

describe('AC-28.14 ttlMs REQUIRED, >= 0 (R-18.2-h)', () => {
  it('accepts ttlMs of 0 and positive', () => {
    expect(ListPromptsResultSchema.safeParse({ resultType: 'complete', prompts: [], ttlMs: 0, cacheScope: 'public' }).success).toBe(true);
    expect(ListPromptsResultSchema.safeParse({ resultType: 'complete', prompts: [], ttlMs: 600000, cacheScope: 'public' }).success).toBe(true);
  });

  it('rejects a negative ttlMs', () => {
    expect(ListPromptsResultSchema.safeParse({ resultType: 'complete', prompts: [], ttlMs: -1, cacheScope: 'public' }).success).toBe(false);
  });

  it('rejects a missing ttlMs', () => {
    expect(ListPromptsResultSchema.safeParse({ resultType: 'complete', prompts: [], cacheScope: 'public' }).success).toBe(false);
  });

  it('buildListPromptsResult throws on a negative ttlMs', () => {
    expect(() => buildListPromptsResult({ prompts: [], ttlMs: -1, cacheScope: 'public' })).toThrow(RangeError);
  });
});

describe('AC-28.15 ttlMs == 0 ⇒ immediately stale (R-18.2-i, R-18.2-j)', () => {
  it('represents the re-fetch-every-time hint as ttlMs 0', () => {
    const result = buildListPromptsResult({ prompts: [], ttlMs: 0, cacheScope: 'public' });
    expect(result.ttlMs).toBe(0);
  });
});

describe('AC-28.16 positive ttlMs ⇒ fresh for that many ms (R-18.2-k)', () => {
  it('carries a positive freshness window verbatim', () => {
    const result = buildListPromptsResult({ prompts: [], ttlMs: 600000, cacheScope: 'public' });
    expect(result.ttlMs).toBe(600000);
  });
});

// ─── AC-28.17: cacheScope ───────────────────────────────────────────────────────

describe('AC-28.17 cacheScope REQUIRED, public|private (R-18.2-l, R-18.2-m)', () => {
  it('accepts public and private', () => {
    expect(ListPromptsResultSchema.safeParse({ resultType: 'complete', prompts: [], ttlMs: 0, cacheScope: 'public' }).success).toBe(true);
    expect(ListPromptsResultSchema.safeParse({ resultType: 'complete', prompts: [], ttlMs: 0, cacheScope: 'private' }).success).toBe(true);
  });

  it('rejects an unknown cacheScope and a missing one', () => {
    expect(ListPromptsResultSchema.safeParse({ resultType: 'complete', prompts: [], ttlMs: 0, cacheScope: 'shared' }).success).toBe(false);
    expect(ListPromptsResultSchema.safeParse({ resultType: 'complete', prompts: [], ttlMs: 0 }).success).toBe(false);
  });
});

// ─── AC-28.18: list resultType ──────────────────────────────────────────────────

describe('AC-28.18 list resultType complete; absent ⇒ complete (R-18.2-n, R-18.2-o, R-18.2-p)', () => {
  it('the server includes resultType "complete"', () => {
    const result = buildListPromptsResult({ prompts: [], ttlMs: 0, cacheScope: 'public' });
    expect(result.resultType).toBe('complete');
  });

  it('a client treats an absent resultType as "complete"', () => {
    expect(resolveListPromptsResultType({})).toBe('complete');
    expect(resolveListPromptsResultType({ resultType: undefined })).toBe('complete');
    expect(resolveListPromptsResultType({ resultType: 'complete' })).toBe('complete');
  });
});

// ─── AC-28.19: _meta optional ───────────────────────────────────────────────────

describe('AC-28.19 ListPromptsResult _meta OPTIONAL (R-18.2-q)', () => {
  it('accepts a result with and without _meta', () => {
    const withMeta = buildListPromptsResult({ prompts: [], ttlMs: 0, cacheScope: 'public', _meta: { k: 1 } });
    expect(withMeta._meta).toEqual({ k: 1 });
    const without = buildListPromptsResult({ prompts: [], ttlMs: 0, cacheScope: 'public' });
    expect(without._meta).toBeUndefined();
    expect(ListPromptsResultSchema.safeParse(without).success).toBe(true);
  });
});

// ─── AC-28.20: list-changed notification on change ──────────────────────────────

describe('AC-28.20 server informs via list_changed when set changes (R-18.2-r)', () => {
  it('builds a list-changed notification with the exact method', () => {
    const note = buildPromptListChangedNotification();
    expect(note.method).toBe('notifications/prompts/list_changed');
    expect(PromptListChangedNotificationSchema.safeParse(note).success).toBe(true);
  });
});

// ─── AC-28.21, AC-28.22: Prompt fields ──────────────────────────────────────────

describe('AC-28.21 Prompt.name REQUIRED; fallback to name for display (R-18.3-a, R-18.3-b)', () => {
  it('rejects a prompt with no name', () => {
    expect(PromptSchema.safeParse({ title: 'x' }).success).toBe(false);
  });

  it('uses name for display when title is absent', () => {
    expect(resolveDisplayName('code_review', undefined)).toBe('code_review');
    expect(resolveDisplayName('code_review', 'Request Code Review')).toBe('Request Code Review');
  });
});

describe('AC-28.22 absent/empty arguments ⇒ accepts no arguments (R-18.3-c)', () => {
  it('a prompt without arguments requires none', () => {
    const prompt = PromptSchema.parse({ name: 'greeting' });
    expect(prompt.arguments).toBeUndefined();
    expect(requiredArgumentNames(prompt)).toEqual([]);
  });

  it('a prompt with empty arguments requires none', () => {
    expect(requiredArgumentNames({ arguments: [] })).toEqual([]);
  });
});

// ─── AC-28.23, AC-28.24, AC-28.25: icons (reference checks; S20 owns rules) ──────

describe('AC-28.23 icons MAY be displayed; rendering support (R-18.3-d, R-18.3-e, R-18.3-f)', () => {
  it('carries the icons field as referenced from §14 (S20 owns render rules)', () => {
    const prompt = PromptSchema.parse(CODE_REVIEW_PROMPT);
    expect(prompt.icons?.[0]?.mimeType).toBe('image/svg+xml');
  });

  it('a prompt without icons is valid (non-rendering clients may ignore them)', () => {
    expect(PromptSchema.safeParse({ name: 'x' }).success).toBe(true);
  });
});

describe('AC-28.24 / AC-28.25 icon src & trust rules referenced, owned by S20', () => {
  it('the Icon shape (src REQUIRED) is carried on Prompt (validated by S20)', () => {
    // S28 only references the §14 Icon shape; an icon with a src is accepted here.
    const prompt = PromptSchema.parse({ name: 'x', icons: [{ src: 'https://example.com/i.png' }] });
    expect(prompt.icons?.[0]?.src).toBe('https://example.com/i.png');
  });
});

// ─── AC-28.26: PromptArgument fields ────────────────────────────────────────────

describe('AC-28.26 PromptArgument.name REQUIRED; display fallback (R-18.3-j, R-18.3-k)', () => {
  it('rejects an argument with no name', () => {
    expect(PromptArgumentSchema.safeParse({ description: 'x' }).success).toBe(false);
  });

  it('accepts a named argument and uses name for display when title is absent', () => {
    const arg = PromptArgumentSchema.parse({ name: 'code', required: true });
    expect(arg.name).toBe('code');
    expect(resolveDisplayName(arg.name, arg.title)).toBe('code');
  });
});

// ─── AC-28.27: required argument omission ⇒ -32602 ──────────────────────────────

describe('AC-28.27 required arg omission is non-conformant ⇒ -32602 (R-18.3-l, R-18.3-m, R-18.4-e)', () => {
  it('requiredArgumentNames reports declared required arguments', () => {
    expect(requiredArgumentNames(CODE_REVIEW_PROMPT)).toEqual(['code']);
  });

  it('validateGetPromptRequest rejects an omitted required argument with -32602', () => {
    const out = validateGetPromptRequest({ name: 'code_review', arguments: {} }, [CODE_REVIEW_PROMPT]);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.code).toBe(-32602);
      expect(out.error.message).toContain('code');
    }
  });

  it('accepts when the required argument is supplied', () => {
    const out = validateGetPromptRequest({ name: 'code_review', arguments: { code: 'x' } }, [CODE_REVIEW_PROMPT]);
    expect(out.ok).toBe(true);
  });
});

// ─── AC-28.28: prompts/get MAY be multi-round-trip ──────────────────────────────

describe('AC-28.28 prompts/get MAY participate in multi-round-trip (R-18.4-a)', () => {
  it('the request params accept inputResponses and requestState', () => {
    const parsed = GetPromptRequestParamsSchema.safeParse({
      name: 'code_review',
      arguments: { code: 'x' },
      inputResponses: { confirm: { action: 'accept' } },
      requestState: 'opaque-server-state-blob',
      _meta: META,
    });
    expect(parsed.success).toBe(true);
  });
});

// ─── AC-28.29: name REQUIRED, must match, unknown ⇒ -32602 ───────────────────────

describe('AC-28.29 name REQUIRED & must match offered prompt (R-18.4-b, R-18.4-c, R-18.4-d)', () => {
  it('rejects request params with no name', () => {
    expect(GetPromptRequestParamsSchema.safeParse({ arguments: {}, _meta: META }).success).toBe(false);
  });

  it('rejects an unknown prompt name with -32602', () => {
    const out = validateGetPromptRequest({ name: 'does_not_exist' }, [CODE_REVIEW_PROMPT]);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.code).toBe(-32602);
      expect(out.error.message).toContain('does_not_exist');
    }
    expect(buildUnknownPromptError('does_not_exist').code).toBe(PROMPTS_INVALID_PARAMS_CODE);
  });

  it('accepts a matching prompt name via array or map lookup', () => {
    expect(validateGetPromptRequest({ name: 'code_review', arguments: { code: 'x' } }, [CODE_REVIEW_PROMPT]).ok).toBe(true);
    const map = new Map([[CODE_REVIEW_PROMPT.name, CODE_REVIEW_PROMPT]]);
    expect(validateGetPromptRequest({ name: 'code_review', arguments: { code: 'x' } }, map).ok).toBe(true);
  });
});

// ─── AC-28.30: validate args; missing required ⇒ -32602 ─────────────────────────

describe('AC-28.30 server validates args; missing required ⇒ -32602 (R-18.4-f, R-18.4-g)', () => {
  it('reports every missing required argument', () => {
    const multi: Prompt = {
      name: 'p',
      arguments: [
        { name: 'a', required: true },
        { name: 'b', required: true },
        { name: 'c' },
      ],
    };
    const out = validateGetPromptRequest({ name: 'p', arguments: { a: '1' } }, [multi]);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.code).toBe(-32602);
      expect(out.error.message).toContain('b');
    }
  });

  it('buildMissingArgumentError lists the omitted names with code -32602', () => {
    const err = buildMissingArgumentError(['x', 'y']);
    expect(err.code).toBe(-32602);
    expect(err.message).toContain('x, y');
  });
});

// ─── AC-28.31: inputResponses key correlation ───────────────────────────────────

describe('AC-28.31 retry inputResponses key-for-key with inputRequests (R-18.4-h)', () => {
  it('the request carries an inputResponses key matching the server inputRequests key', () => {
    const parsed = GetPromptRequestParamsSchema.parse({
      name: 'code_review',
      arguments: { code: 'x' },
      inputResponses: { confirm: { action: 'accept', content: { approved: true } } },
      requestState: 'opaque-server-state-blob',
      _meta: META,
    });
    expect(Object.keys(parsed.inputResponses ?? {})).toEqual(['confirm']);
  });
});

// ─── AC-28.32: requestState echoed verbatim, opaque ─────────────────────────────

describe('AC-28.32 requestState echoed verbatim & opaque (R-18.4-i, R-18.4-j, R-18.4-k)', () => {
  it('the request carries the requestState string exactly as supplied', () => {
    const state = 'opaque-server-state-blob';
    const parsed = GetPromptRequestParamsSchema.parse({
      name: 'code_review',
      requestState: state,
      _meta: META,
    });
    expect(parsed.requestState).toBe(state);
  });
});

// ─── AC-28.33: messages REQUIRED, one or several ────────────────────────────────

describe('AC-28.33 GetPromptResult.messages REQUIRED (R-18.4-l, R-18.4-m)', () => {
  it('rejects a result missing messages', () => {
    expect(GetPromptResultSchema.safeParse({ resultType: 'complete' }).success).toBe(false);
  });

  it('accepts one message and several messages', () => {
    const one = buildGetPromptResult({
      messages: [{ role: 'user', content: { type: 'text', text: 'hi' } }],
    });
    expect(one.messages).toHaveLength(1);
    const several = buildGetPromptResult({
      messages: [
        { role: 'user', content: { type: 'text', text: 'hi' } },
        { role: 'assistant', content: { type: 'text', text: 'hello' } },
      ],
    });
    expect(several.messages).toHaveLength(2);
    expect(GetPromptResultSchema.safeParse(several).success).toBe(true);
  });
});

// ─── AC-28.34: get resultType complete; absent ⇒ complete ───────────────────────

describe('AC-28.34 get resultType complete; absent ⇒ complete (R-18.4-n, R-18.4-o, R-18.4-p)', () => {
  it('the server includes resultType "complete"', () => {
    const result = buildGetPromptResult({ messages: [{ role: 'user', content: { type: 'text', text: 'x' } }] });
    expect(result.resultType).toBe('complete');
  });

  it('a client treats an absent resultType as "complete"', () => {
    expect(resolveGetPromptResultType({})).toBe('complete');
    expect(resolveGetPromptResultType({ resultType: undefined })).toBe('complete');
  });
});

// ─── AC-28.35: input_required alternative & resultType inspection ────────────────

describe('AC-28.35 input_required alternative; inspect resultType first (R-18.4-q, R-18.4-r)', () => {
  it('discriminates a completed GetPromptResult', () => {
    const out = discriminateGetPromptResponse({
      resultType: 'complete',
      messages: [{ role: 'user', content: { type: 'text', text: 'x' } }],
    });
    expect(out.kind).toBe('complete');
    if (out.kind === 'complete') {
      expect(out.result.messages).toHaveLength(1);
    }
  });

  it('discriminates an absent resultType as complete (R-18.4-p)', () => {
    const out = discriminateGetPromptResponse({
      messages: [{ role: 'user', content: { type: 'text', text: 'x' } }],
    });
    expect(out.kind).toBe('complete');
  });

  it('discriminates an InputRequiredResult', () => {
    const out = discriminateGetPromptResponse({
      resultType: 'input_required',
      inputRequests: { confirm: { method: 'elicitation/create', params: {} } },
      requestState: 'opaque-server-state-blob',
    });
    expect(out.kind).toBe('input_required');
    if (out.kind === 'input_required') {
      expect(out.result.requestState).toBe('opaque-server-state-blob');
    }
  });

  it('treats an unrecognized resultType as an error (MUST NOT parse the body)', () => {
    const out = discriminateGetPromptResponse({ resultType: 'totally_made_up', messages: [] });
    expect(out.kind).toBe('error');
    if (out.kind === 'error') {
      expect(out.resultType).toBe('totally_made_up');
    }
  });

  it('input_required signal matches the S17 discriminator value', () => {
    expect(MRTR_RESULT_TYPE.INPUT_REQUIRED).toBe('input_required');
    expect(InputRequiredResultSchema.safeParse({ resultType: 'input_required', requestState: 's' }).success).toBe(true);
  });
});

// ─── AC-28.36: error code mapping ───────────────────────────────────────────────

describe('AC-28.36 error mapping: -32602 (name/args), -32603 (internal) (R-18.4-s)', () => {
  it('unknown name and missing required argument both yield -32602', () => {
    expect(buildUnknownPromptError('x').code).toBe(-32602);
    expect(buildMissingArgumentError(['x']).code).toBe(-32602);
    expect(PROMPTS_INVALID_PARAMS_CODE).toBe(-32602);
  });

  it('an internal failure yields -32603', () => {
    const err = buildPromptInternalError('db down');
    expect(err.code).toBe(-32603);
    expect(err.message).toContain('db down');
    expect(PROMPTS_INTERNAL_ERROR_CODE).toBe(-32603);
  });
});

// ─── AC-28.37: PromptMessage role & single content ──────────────────────────────

describe('AC-28.37 PromptMessage role & single content block (R-18.5-a, R-18.5-b)', () => {
  it('accepts user and assistant roles', () => {
    expect(PromptMessageSchema.safeParse({ role: 'user', content: { type: 'text', text: 'x' } }).success).toBe(true);
    expect(PromptMessageSchema.safeParse({ role: 'assistant', content: { type: 'text', text: 'x' } }).success).toBe(true);
  });

  it('rejects an invalid role', () => {
    expect(PromptMessageSchema.safeParse({ role: 'system', content: { type: 'text', text: 'x' } }).success).toBe(false);
  });

  it('rejects content as an array (content is a single object)', () => {
    expect(PromptMessageSchema.safeParse({ role: 'user', content: [{ type: 'text', text: 'x' }] }).success).toBe(false);
  });

  it('accepts the valid content kinds: text, image, audio, resource_link, embedded resource', () => {
    const kinds = [
      { type: 'text', text: 'x' },
      { type: 'image', data: 'aGk=', mimeType: 'image/png' },
      { type: 'audio', data: 'aGk=', mimeType: 'audio/wav' },
      { type: 'resource_link', uri: 'file:///a', name: 'a' },
      { type: 'resource', resource: { uri: 'file:///a', text: 'hi' } },
    ];
    for (const content of kinds) {
      expect(PromptMessageSchema.safeParse({ role: 'user', content }).success).toBe(true);
    }
  });

  it('rejects a message missing role or content', () => {
    expect(PromptMessageSchema.safeParse({ content: { type: 'text', text: 'x' } }).success).toBe(false);
    expect(PromptMessageSchema.safeParse({ role: 'user' }).success).toBe(false);
  });
});

// ─── AC-28.38: resource_link content ────────────────────────────────────────────

describe('AC-28.38 resource_link supplies fetchable context (R-18.5-c)', () => {
  it('accepts a resource_link content block in a prompt message', () => {
    const msg = PromptMessageSchema.parse({
      role: 'user',
      content: { type: 'resource_link', uri: 'file:///doc.md', name: 'doc' },
    });
    expect((msg.content as { type: string }).type).toBe('resource_link');
  });
});

// ─── AC-28.39: list_changed method & emit/no-emit ───────────────────────────────

describe('AC-28.39 list_changed notification method & gating (R-18.6-a, R-18.6-b, R-18.6-d, R-18.6-g)', () => {
  it('uses the exact method string from the canonical constant', () => {
    expect(PROMPTS_LIST_CHANGED_METHOD).toBe('notifications/prompts/list_changed');
    const note = buildPromptListChangedNotification();
    expect(note.method).toBe('notifications/prompts/list_changed');
    expect(note.jsonrpc).toBe('2.0');
  });

  it('a one-way notification has no id', () => {
    const note = buildPromptListChangedNotification();
    expect('id' in note).toBe(false);
  });

  it('a listChanged:true server may emit (expected); an undeclared one is not expected', () => {
    expect(mayExpectPromptsListChanged({ prompts: { listChanged: true } })).toBe(true);
    expect(mayExpectPromptsListChanged({ prompts: {} })).toBe(false);
  });

  it('the wire example notification parses', () => {
    expect(
      PromptListChangedNotificationSchema.safeParse({
        jsonrpc: '2.0',
        method: 'notifications/prompts/list_changed',
      }).success,
    ).toBe(true);
  });
});

// ─── AC-28.40: list_changed params carry only _meta ─────────────────────────────

describe('AC-28.40 list_changed params carry only _meta (R-18.6-c)', () => {
  it('accepts params with _meta only', () => {
    const note = buildPromptListChangedNotification({ trace: 'abc' });
    expect(note.params?._meta).toEqual({ trace: 'abc' });
    expect(PromptListChangedNotificationSchema.safeParse(note).success).toBe(true);
  });

  it('accepts an absent params object', () => {
    const note = buildPromptListChangedNotification();
    expect(note.params).toBeUndefined();
  });

  it('the params schema accepts an _meta map', () => {
    expect(PromptListChangedNotificationParamsSchema.safeParse({ _meta: { k: 1 } }).success).toBe(true);
    expect(PromptListChangedNotificationParamsSchema.safeParse({}).success).toBe(true);
  });
});

// ─── AC-28.41: client reaction to list_changed ──────────────────────────────────

describe('AC-28.41 client invalidates cache & may re-issue list (R-18.6-e, R-18.6-f)', () => {
  it('the notification a client receives is well-formed, enabling cache invalidation + re-list', () => {
    const note = buildPromptListChangedNotification();
    const parsed = PromptListChangedNotificationSchema.safeParse(note);
    expect(parsed.success).toBe(true);
    // The client may then re-issue prompts/list — its request params are valid.
    expect(ListPromptsRequestParamsSchema.safeParse({}).success).toBe(true);
  });
});

// ─── AC-28.42: argument-completion hook ─────────────────────────────────────────

describe('AC-28.42 prompt argument values are completable (R-18.7-a)', () => {
  it('mayCompletePromptArgument is true (hook points to the Completion utility, §19)', () => {
    expect(mayCompletePromptArgument()).toBe(true);
  });
});
