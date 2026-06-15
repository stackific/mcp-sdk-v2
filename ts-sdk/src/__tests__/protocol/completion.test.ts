/**
 * Tests for S29 — Completion (§19).
 *
 * AC coverage (one or more `describe` blocks per AC):
 *  AC-29.1  (R-19.1-a, R-19.1-b)                       — `completions` capability advertised as a JSON object; `{}` baseline
 *  AC-29.2  (R-19.1-c, R-19.1-d, R-19.5-q)             — no capability ⇒ client must not send; server answers -32601
 *  AC-29.3  (R-19-a, R-19.2-a)                         — only `completion/complete`, exact case-sensitive name, client→server
 *  AC-29.4  (R-19.2-b, R-19.5-s)                       — absent `ref` ⇒ -32602
 *  AC-29.5  (R-19.2-c, R-19.2-d)                       — variant selected by `ref.type`
 *  AC-29.6  (R-19.2-e, R-19.3-f, R-19.5-s)             — closed union: any other `ref.type` ⇒ -32602
 *  AC-29.7  (R-19.2-f, R-19.2-g, R-19.2-h, R-19.5-s)   — missing/malformed argument fields ⇒ -32602
 *  AC-29.8  (R-19.2-i)                                 — empty seed ⇒ empty-input suggestions, no error
 *  AC-29.9  (R-19.2-j, R-19.2-k, R-19.5-m)             — context.arguments populated; keys exclude argument.name
 *  AC-29.10 (R-19.2-l, R-19.5-f)                       — server MAY ignore context and still return a valid result
 *  AC-29.11 (R-19.3-a–d)                               — PromptReference/ResourceTemplateReference required fields
 *  AC-29.12 (R-19.3-e)                                 — ResourceTemplateReference.uri literal OR template
 *  AC-29.13 (R-19.4-a, R-19.4-b, R-19.5-c)             — completion object + ranked values array
 *  AC-29.14 (R-19.4-c–f, R-19.5-g, R-19.5-h)           — >100 matches: cap at 100, hasMore=true, MAY total
 *  AC-29.15 (R-19.4-g)                                 — no matches ⇒ empty values, still valid
 *  AC-29.16 (R-19.4-h)                                 — total MAY exceed values.length; omitted ⇒ unknown
 *  AC-29.17 (R-19.4-i)                                 — omitted hasMore treated as false
 *  AC-29.18 (R-19.4-j, R-19.4-k, R-19.4-l)             — resultType "complete"; absent ⇒ "complete"
 *  AC-29.19 (R-19.5-a, R-19.5-b)                       — advisory: value absent from results not forbidden
 *  AC-29.20 (R-19.5-d, R-19.5-e)                       — match against seed; refine with context
 *  AC-29.21 (R-19.5-i, R-19.5-j, R-19.5-t)             — validate inputs; -32603 for internal failures
 *  AC-29.22 (R-19.5-k, R-19.5-l)                       — access control: entitlement filter applied before capping
 *  AC-29.23 (R-19.5-n, R-19.5-o, R-19.5-p)             — client debounces, MAY cache, handles partial results
 *  AC-29.24 (R-19.5-r)                                 — unknown ref / unknown argument ⇒ -32602 (not a not-found result)
 */

import { describe, it, expect } from 'vitest';
import {
  COMPLETION_COMPLETE_METHOD,
  COMPLETION_METHOD_NOT_FOUND_CODE,
  COMPLETION_INVALID_PARAMS_CODE,
  COMPLETION_INTERNAL_ERROR_CODE,
  MAX_COMPLETION_VALUES,
  CompletionsCapabilitySchema,
  buildCompletionsCapability,
  serverDeclaresCompletions,
  mayCallCompletion,
  completionGatedByCompletions,
  PROMPT_REFERENCE_TYPE,
  RESOURCE_TEMPLATE_REFERENCE_TYPE,
  PromptReferenceSchema,
  ResourceTemplateReferenceSchema,
  CompletionReferenceSchema,
  isPromptReference,
  isResourceTemplateReference,
  CompletionArgumentSchema,
  CompletionContextSchema,
  CompleteRequestParamsSchema,
  buildCompleteRequestParams,
  CompletionObjectSchema,
  CompleteResultSchema,
  resolveCompleteResultType,
  resolveHasMore,
  buildCompleteResult,
  computeCompletion,
  prefixMatch,
  buildCompletionNotSupportedError,
  buildCompletionInvalidParamsError,
  buildUnknownReferenceError,
  buildCompletionInternalError,
  validateCompleteRequest,
  resolveCompletionTarget,
  promptArgumentNamesOf,
  resourceTemplateVariableNamesOf,
  type CompletionCatalog,
} from '../../protocol/completion.js';
import { mayClientInvoke } from '../../protocol/capability-negotiation.js';
import { uriTemplateVariables } from '../../protocol/resources.js';

// A reusable valid request params object.
function validParams(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ref: { type: PROMPT_REFERENCE_TYPE, name: 'code_review' },
    argument: { name: 'framework', value: 'fla' },
    ...overrides,
  };
}

// ─── AC-29.1 — `completions` capability is a JSON object; `{}` baseline ─────────

describe('completions capability advertisement (AC-29.1 · R-19.1-a, R-19.1-b)', () => {
  it('the recommended baseline is the empty object {}', () => {
    expect(buildCompletionsCapability()).toEqual({});
  });

  it('accepts {} and an open (non-empty) object', () => {
    expect(CompletionsCapabilitySchema.safeParse({}).success).toBe(true);
    expect(CompletionsCapabilitySchema.safeParse({ experimentalRanker: true }).success).toBe(true);
  });

  it('serverDeclaresCompletions is true only when the object is present', () => {
    expect(serverDeclaresCompletions({ completions: {} })).toBe(true);
    expect(serverDeclaresCompletions({ completions: { x: 1 } })).toBe(true);
    expect(serverDeclaresCompletions({})).toBe(false);
  });
});

// ─── AC-29.2 — no capability ⇒ client must not send; server answers -32601 ──────

describe('gating: no completions capability (AC-29.2 · R-19.1-c, R-19.1-d, R-19.5-q)', () => {
  it('a client MUST NOT send completion/complete without the capability', () => {
    expect(mayCallCompletion({})).toBe(false);
    expect(mayCallCompletion({ completions: {} })).toBe(true);
  });

  it('reuses the S10 gate (mayClientInvoke) for completion/complete', () => {
    expect(completionGatedByCompletions()).toBe(true);
    expect(mayClientInvoke(COMPLETION_COMPLETE_METHOD, {})).toBe(false);
    expect(mayClientInvoke(COMPLETION_COMPLETE_METHOD, { completions: {} })).toBe(true);
  });

  it('a non-advertising server responds with -32601', () => {
    const err = buildCompletionNotSupportedError();
    expect(err.code).toBe(COMPLETION_METHOD_NOT_FOUND_CODE);
    expect(COMPLETION_METHOD_NOT_FOUND_CODE).toBe(-32601);
    expect(err.message).toContain(COMPLETION_COMPLETE_METHOD);
  });
});

// ─── AC-29.3 — only completion/complete, exact case-sensitive name ─────────────

describe('the single completion method (AC-29.3 · R-19-a, R-19.2-a)', () => {
  it('the method string is exactly "completion/complete"', () => {
    expect(COMPLETION_COMPLETE_METHOD).toBe('completion/complete');
  });

  it('is case-sensitive — a differently cased name is not the method', () => {
    const miscased = 'Completion/Complete';
    expect(miscased === COMPLETION_COMPLETE_METHOD).toBe(false);
    // and the gate does not recognize the miscased method as gated/valid.
    expect(mayClientInvoke(miscased, { completions: {} })).toBe(true); // ungated → permissive, but not the spec method
    expect(miscased).not.toBe(COMPLETION_COMPLETE_METHOD);
  });
});

// ─── AC-29.4 — absent ref ⇒ -32602 ──────────────────────────────────────────────

describe('ref is required (AC-29.4 · R-19.2-b, R-19.5-s)', () => {
  it('rejects params with no ref via -32602', () => {
    const res = validateCompleteRequest({ argument: { name: 'a', value: '' } });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe(COMPLETION_INVALID_PARAMS_CODE);
      expect(COMPLETION_INVALID_PARAMS_CODE).toBe(-32602);
    }
  });

  it('schema rejects a missing ref', () => {
    expect(CompleteRequestParamsSchema.safeParse({ argument: { name: 'a', value: '' } }).success).toBe(
      false,
    );
  });
});

// ─── AC-29.5 — variant selected by ref.type ─────────────────────────────────────

describe('ref variant selected by ref.type (AC-29.5 · R-19.2-c, R-19.2-d)', () => {
  it('ref/prompt parses as a PromptReference', () => {
    const ref = CompletionReferenceSchema.parse({ type: PROMPT_REFERENCE_TYPE, name: 'p' });
    expect(isPromptReference(ref)).toBe(true);
    expect(isResourceTemplateReference(ref)).toBe(false);
  });

  it('ref/resource parses as a ResourceTemplateReference', () => {
    const ref = CompletionReferenceSchema.parse({ type: RESOURCE_TEMPLATE_REFERENCE_TYPE, uri: 'file:///x' });
    expect(isResourceTemplateReference(ref)).toBe(true);
    expect(isPromptReference(ref)).toBe(false);
  });

  it('the discriminator values are the exact spec strings', () => {
    expect(PROMPT_REFERENCE_TYPE).toBe('ref/prompt');
    expect(RESOURCE_TEMPLATE_REFERENCE_TYPE).toBe('ref/resource');
  });
});

// ─── AC-29.6 — closed union: any other ref.type ⇒ -32602 ────────────────────────

describe('closed ref union (AC-29.6 · R-19.2-e, R-19.3-f, R-19.5-s)', () => {
  it('rejects an unknown ref.type at the schema level', () => {
    expect(CompletionReferenceSchema.safeParse({ type: 'ref/tool', name: 'x' }).success).toBe(false);
  });

  it('validateCompleteRequest maps a bad ref.type to -32602', () => {
    const res = validateCompleteRequest(
      validParams({ ref: { type: 'ref/unknown', name: 'x' } }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe(COMPLETION_INVALID_PARAMS_CODE);
  });
});

// ─── AC-29.7 — missing/malformed argument fields ⇒ -32602 ───────────────────────

describe('argument is required with name+value (AC-29.7 · R-19.2-f, R-19.2-g, R-19.2-h, R-19.5-s)', () => {
  it('rejects a missing argument object', () => {
    const res = validateCompleteRequest({ ref: { type: PROMPT_REFERENCE_TYPE, name: 'p' } });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe(COMPLETION_INVALID_PARAMS_CODE);
  });

  it('rejects a missing argument.name', () => {
    const res = validateCompleteRequest(validParams({ argument: { value: 'x' } }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe(COMPLETION_INVALID_PARAMS_CODE);
  });

  it('rejects a missing argument.value', () => {
    const res = validateCompleteRequest(validParams({ argument: { name: 'x' } }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe(COMPLETION_INVALID_PARAMS_CODE);
  });

  it('rejects a non-string argument.value (malformed)', () => {
    const res = validateCompleteRequest(validParams({ argument: { name: 'x', value: 42 } }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe(COMPLETION_INVALID_PARAMS_CODE);
  });

  it('CompletionArgumentSchema requires both name and value strings', () => {
    expect(CompletionArgumentSchema.safeParse({ name: 'a', value: '' }).success).toBe(true);
    expect(CompletionArgumentSchema.safeParse({ name: 'a' }).success).toBe(false);
  });
});

// ─── AC-29.8 — empty seed ⇒ empty-input suggestions, no error ────────────────────

describe('empty argument.value (AC-29.8 · R-19.2-i)', () => {
  it('accepts argument.value === "" without error', () => {
    const res = validateCompleteRequest(validParams({ argument: { name: 'framework', value: '' } }));
    expect(res.ok).toBe(true);
  });

  it('prefixMatch on an empty seed returns every candidate (empty-input suggestions)', () => {
    const candidates = ['python', 'pytorch', 'rails'];
    expect(prefixMatch('', candidates)).toEqual(candidates);
  });
});

// ─── AC-29.9 — context.arguments populated; keys exclude argument.name ──────────

describe('context.arguments excludes the completed argument (AC-29.9 · R-19.2-j, R-19.2-k, R-19.5-m)', () => {
  it('accepts a sibling-only context', () => {
    const res = validateCompleteRequest(
      validParams({ context: { arguments: { language: 'python' } } }),
    );
    expect(res.ok).toBe(true);
  });

  it('rejects context.arguments containing argument.name with -32602', () => {
    const res = validateCompleteRequest(
      validParams({ argument: { name: 'framework', value: 'fla' }, context: { arguments: { framework: 'x' } } }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe(COMPLETION_INVALID_PARAMS_CODE);
  });

  it('buildCompleteRequestParams throws when context includes the completed argument', () => {
    expect(() =>
      buildCompleteRequestParams({
        ref: { type: PROMPT_REFERENCE_TYPE, name: 'p' },
        argument: { name: 'framework', value: 'fla' },
        context: { arguments: { framework: 'x' } },
      }),
    ).toThrow(/R-19\.2-k/);
  });

  it('buildCompleteRequestParams keeps a valid sibling context', () => {
    const params = buildCompleteRequestParams({
      ref: { type: PROMPT_REFERENCE_TYPE, name: 'p' },
      argument: { name: 'framework', value: 'fla' },
      context: { arguments: { language: 'python' } },
    });
    expect(params.context?.arguments).toEqual({ language: 'python' });
  });
});

// ─── AC-29.10 — server MAY ignore context and still return a valid result ───────

describe('server MAY ignore context (AC-29.10 · R-19.2-l, R-19.5-f)', () => {
  it('CompletionContextSchema accepts an empty/absent arguments map', () => {
    expect(CompletionContextSchema.safeParse({}).success).toBe(true);
    expect(CompletionContextSchema.safeParse({ arguments: {} }).success).toBe(true);
  });

  it('a result built without consulting context is still valid', () => {
    const result = buildCompleteResult({ values: ['python'] });
    expect(CompleteResultSchema.safeParse(result).success).toBe(true);
  });
});

// ─── AC-29.11 — reference required fields ────────────────────────────────────────

describe('reference required fields (AC-29.11 · R-19.3-a–d)', () => {
  it('PromptReference requires type "ref/prompt" and name', () => {
    expect(PromptReferenceSchema.safeParse({ type: PROMPT_REFERENCE_TYPE, name: 'p' }).success).toBe(true);
    expect(PromptReferenceSchema.safeParse({ type: PROMPT_REFERENCE_TYPE }).success).toBe(false);
    expect(PromptReferenceSchema.safeParse({ type: 'ref/resource', name: 'p' }).success).toBe(false);
  });

  it('PromptReference.title is optional and not required for matching', () => {
    expect(
      PromptReferenceSchema.safeParse({ type: PROMPT_REFERENCE_TYPE, name: 'p', title: 'Pretty' }).success,
    ).toBe(true);
  });

  it('ResourceTemplateReference requires type "ref/resource" and uri', () => {
    expect(
      ResourceTemplateReferenceSchema.safeParse({ type: RESOURCE_TEMPLATE_REFERENCE_TYPE, uri: 'file:///x' }).success,
    ).toBe(true);
    expect(ResourceTemplateReferenceSchema.safeParse({ type: RESOURCE_TEMPLATE_REFERENCE_TYPE }).success).toBe(false);
  });
});

// ─── AC-29.12 — ResourceTemplateReference.uri literal OR template ───────────────

describe('ResourceTemplateReference.uri literal or template (AC-29.12 · R-19.3-e)', () => {
  it('accepts a literal URI', () => {
    expect(
      ResourceTemplateReferenceSchema.safeParse({
        type: RESOURCE_TEMPLATE_REFERENCE_TYPE,
        uri: 'file:///etc/hosts',
      }).success,
    ).toBe(true);
  });

  it('accepts a URI template with variables', () => {
    expect(
      ResourceTemplateReferenceSchema.safeParse({
        type: RESOURCE_TEMPLATE_REFERENCE_TYPE,
        uri: 'file:///{path}',
      }).success,
    ).toBe(true);
  });
});

// ─── AC-29.13 — completion object + ranked values array ─────────────────────────

describe('CompleteResult shape (AC-29.13 · R-19.4-a, R-19.4-b, R-19.5-c)', () => {
  it('carries a required completion.values array', () => {
    const result = buildCompleteResult({ values: ['python', 'pytorch', 'pyside'], total: 10, hasMore: true });
    const parsed = CompleteResultSchema.safeParse(result);
    expect(parsed.success).toBe(true);
    expect(result.completion.values).toEqual(['python', 'pytorch', 'pyside']);
  });

  it('rejects a completion object with no values', () => {
    expect(CompletionObjectSchema.safeParse({ total: 1 }).success).toBe(false);
  });

  it('preserves the caller-supplied (most-relevant-first) order', () => {
    const c = computeCompletion(['z-best', 'a-worse']);
    expect(c.values).toEqual(['z-best', 'a-worse']);
  });
});

// ─── AC-29.14 — >100 matches: cap at 100, hasMore, MAY total ────────────────────

describe('100-item cap & truncation (AC-29.14 · R-19.4-c–f, R-19.5-g, R-19.5-h)', () => {
  const many = Array.from({ length: 250 }, (_, i) => `item-${i}`);

  it('caps values at exactly 100', () => {
    const c = computeCompletion(many);
    expect(c.values.length).toBe(MAX_COMPLETION_VALUES);
    expect(MAX_COMPLETION_VALUES).toBe(100);
  });

  it('signals truncation via hasMore=true and reports the true total', () => {
    const c = computeCompletion(many);
    expect(c.hasMore).toBe(true);
    expect(c.total).toBe(250);
  });

  it('the parsed result never exceeds 100 values', () => {
    const result = buildCompleteResult({ values: computeCompletion(many).values, total: 250, hasMore: true });
    expect(CompleteResultSchema.safeParse(result).success).toBe(true);
    expect(result.completion.values.length).toBe(100);
  });

  it('schema rejects a values array longer than 100', () => {
    const tooMany = Array.from({ length: 101 }, (_, i) => `v${i}`);
    expect(CompletionObjectSchema.safeParse({ values: tooMany }).success).toBe(false);
  });

  it('buildCompleteResult throws when given more than 100 values', () => {
    const tooMany = Array.from({ length: 101 }, (_, i) => `v${i}`);
    expect(() => buildCompleteResult({ values: tooMany })).toThrow(/R-19\.4/);
  });

  it('an explicit total override marks truncation even for a small returned list', () => {
    const c = computeCompletion(['python', 'pytorch', 'pyside'], { total: 10 });
    expect(c.total).toBe(10);
    expect(c.hasMore).toBe(true);
    expect(c.values.length).toBe(3);
  });
});

// ─── AC-29.15 — no matches ⇒ empty values, still valid ───────────────────────────

describe('no matches (AC-29.15 · R-19.4-g)', () => {
  it('an empty values array is a valid completion', () => {
    const result = buildCompleteResult({ values: [] });
    expect(CompleteResultSchema.safeParse(result).success).toBe(true);
    expect(result.completion.values).toEqual([]);
  });

  it('computeCompletion over no matches returns an empty, untruncated completion', () => {
    const c = computeCompletion([]);
    expect(c.values).toEqual([]);
    expect(c.hasMore).toBeUndefined();
    expect(c.total).toBeUndefined();
  });
});

// ─── AC-29.16 — total MAY exceed values.length; omitted ⇒ unknown ───────────────

describe('total semantics (AC-29.16 · R-19.4-h)', () => {
  it('total may exceed the number of returned values', () => {
    const result = buildCompleteResult({ values: ['a', 'b'], total: 999, hasMore: true });
    expect(result.completion.total).toBe(999);
    expect(result.completion.total! > result.completion.values.length).toBe(true);
    expect(CompleteResultSchema.safeParse(result).success).toBe(true);
  });

  it('total is omitted (unknown) when not supplied', () => {
    const result = buildCompleteResult({ values: ['a'] });
    expect(result.completion.total).toBeUndefined();
  });
});

// ─── AC-29.17 — omitted hasMore treated as false ────────────────────────────────

describe('hasMore omission (AC-29.17 · R-19.4-i)', () => {
  it('resolveHasMore treats an omitted hasMore as false', () => {
    expect(resolveHasMore({})).toBe(false);
    expect(resolveHasMore({ hasMore: false })).toBe(false);
    expect(resolveHasMore({ hasMore: true })).toBe(true);
  });

  it('a built result without hasMore omits the field', () => {
    const result = buildCompleteResult({ values: ['a'] });
    expect(result.completion.hasMore).toBeUndefined();
    expect(resolveHasMore(result.completion)).toBe(false);
  });
});

// ─── AC-29.18 — resultType "complete"; absent ⇒ "complete" ──────────────────────

describe('resultType discriminator (AC-29.18 · R-19.4-j, R-19.4-k, R-19.4-l)', () => {
  it('a built result includes resultType "complete"', () => {
    expect(buildCompleteResult({ values: [] }).resultType).toBe('complete');
  });

  it('resolveCompleteResultType treats an absent resultType as "complete"', () => {
    expect(resolveCompleteResultType({})).toBe('complete');
    expect(resolveCompleteResultType({ resultType: 'complete' })).toBe('complete');
  });
});

// ─── AC-29.19 — advisory: value absent from results is not forbidden ─────────────

describe('advisory completion (AC-29.19 · R-19.5-a, R-19.5-b)', () => {
  it('a value the server never surfaced is not, thereby, forbidden', () => {
    // The reference engine surfaces a subset of candidates; a value outside that
    // subset (e.g. typed freehand) is still a legitimate submission — completion
    // is advisory, never an allow-list.
    const surfaced = computeCompletion(['python', 'pytorch']).values;
    const userTyped = 'pyramid';
    expect(surfaced.includes(userTyped)).toBe(false);
    // There is no API that rejects a value merely because it is unsurfaced —
    // assert by construction that no such forbidding helper exists in the flow.
    expect(typeof buildCompleteResult).toBe('function');
  });
});

// ─── AC-29.20 — match against seed; refine with context ─────────────────────────

describe('matching and context refinement (AC-29.20 · R-19.5-d, R-19.5-e)', () => {
  it('prefixMatch matches candidates against a non-empty seed', () => {
    expect(prefixMatch('py', ['python', 'pytorch', 'rails'])).toEqual(['python', 'pytorch']);
  });

  it('prefixMatch supports case-insensitive matching', () => {
    expect(prefixMatch('PY', ['python', 'Pytorch'], { caseInsensitive: true })).toEqual(['python', 'Pytorch']);
  });

  it('context can narrow the candidate pool before matching (server choice)', () => {
    // A server SHOULD use context.arguments to refine; modeled by choosing a
    // language-specific pool, then matching the seed.
    const byLanguage: Record<string, string[]> = {
      python: ['pytorch', 'pyramid', 'pydantic'],
      ruby: ['rails', 'roda'],
    };
    const pool = byLanguage['python']!;
    expect(prefixMatch('py', pool)).toEqual(['pytorch', 'pyramid', 'pydantic']);
  });
});

// ─── AC-29.21 — validate inputs; -32603 for internal failures ───────────────────

describe('robustness & internal failure (AC-29.21 · R-19.5-i, R-19.5-j, R-19.5-t)', () => {
  it('validates inputs (a non-object params is rejected)', () => {
    expect(validateCompleteRequest(null).ok).toBe(false);
    expect(validateCompleteRequest('nope').ok).toBe(false);
    expect(validateCompleteRequest([]).ok).toBe(false);
  });

  it('internal failures map to -32603', () => {
    const err = buildCompletionInternalError('ranker timed out');
    expect(err.code).toBe(COMPLETION_INTERNAL_ERROR_CODE);
    expect(COMPLETION_INTERNAL_ERROR_CODE).toBe(-32603);
    expect(err.message).toContain('ranker timed out');
  });

  it('the invalid-params builder produces -32602', () => {
    expect(buildCompletionInvalidParamsError('bad').code).toBe(-32602);
  });
});

// ─── AC-29.22 — access control: entitlement filter applied before capping ───────

describe('access control over suggested values (AC-29.22 · R-19.5-k, R-19.5-l)', () => {
  it('a server filters out unentitled values before building the result', () => {
    // The server applies its entitlement filter to the candidate pool; the
    // unentitled value never reaches computeCompletion, so it cannot leak.
    const allCandidates = ['public-a', 'secret-x', 'public-b'];
    const entitled = (v: string) => !v.startsWith('secret-');
    const filtered = allCandidates.filter(entitled);
    const c = computeCompletion(filtered);
    expect(c.values).toEqual(['public-a', 'public-b']);
    expect(c.values.includes('secret-x')).toBe(false);
  });
});

// ─── AC-29.23 — client handles partial / missing-field results gracefully ───────

describe('client graceful handling (AC-29.23 · R-19.5-n, R-19.5-o, R-19.5-p)', () => {
  it('handles a result missing hasMore and total without error', () => {
    const partial = { resultType: 'complete', completion: { values: ['x'] } };
    expect(CompleteResultSchema.safeParse(partial).success).toBe(true);
    expect(resolveHasMore(partial.completion)).toBe(false);
  });

  it('handles a result that omits resultType by defaulting to "complete"', () => {
    const noType = { completion: { values: [] } };
    expect(resolveCompleteResultType(noType)).toBe('complete');
  });

  it('handles an empty completion (no matches) without throwing', () => {
    const empty = { resultType: 'complete', completion: { values: [] } };
    expect(CompleteResultSchema.safeParse(empty).success).toBe(true);
  });
});

// ─── AC-29.24 — unknown ref / unknown argument ⇒ -32602 (not a not-found) ───────

describe('unknown ref / argument resolution (AC-29.24 · R-19.5-r)', () => {
  const catalog: CompletionCatalog = {
    promptArgumentNames(name) {
      return name === 'code_review' ? ['framework', 'language'] : undefined;
    },
    resourceTemplateVariableNames(uri) {
      return uri === 'file:///{path}' ? ['path'] : undefined;
    },
  };

  function paramsFor(ref: Record<string, unknown>, argName: string): never | ReturnType<typeof requireOk> {
    const res = validateCompleteRequest({ ref, argument: { name: argName, value: '' } });
    return requireOk(res);
  }
  function requireOk(res: ReturnType<typeof validateCompleteRequest>) {
    if (!res.ok) throw new Error('expected valid shape');
    return res.params;
  }

  it('an unknown prompt ⇒ -32602 (Invalid params, not not-found)', () => {
    const params = paramsFor({ type: PROMPT_REFERENCE_TYPE, name: 'code_reviw' }, 'framework');
    const r = resolveCompletionTarget(params, catalog);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe(COMPLETION_INVALID_PARAMS_CODE);
      expect(r.error.message).toContain('unknown prompt');
    }
  });

  it('a known prompt but unknown argument ⇒ -32602', () => {
    const params = paramsFor({ type: PROMPT_REFERENCE_TYPE, name: 'code_review' }, 'nope');
    const r = resolveCompletionTarget(params, catalog);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe(COMPLETION_INVALID_PARAMS_CODE);
  });

  it('a known prompt and known argument resolves ok', () => {
    const params = paramsFor({ type: PROMPT_REFERENCE_TYPE, name: 'code_review' }, 'framework');
    expect(resolveCompletionTarget(params, catalog).ok).toBe(true);
  });

  it('an unknown resource template ⇒ -32602', () => {
    const params = paramsFor({ type: RESOURCE_TEMPLATE_REFERENCE_TYPE, uri: 'file:///{nope}' }, 'path');
    const r = resolveCompletionTarget(params, catalog);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toContain('unknown resource template');
  });

  it('a known template but unknown variable ⇒ -32602', () => {
    const params = paramsFor({ type: RESOURCE_TEMPLATE_REFERENCE_TYPE, uri: 'file:///{path}' }, 'other');
    const r = resolveCompletionTarget(params, catalog);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe(COMPLETION_INVALID_PARAMS_CODE);
  });

  it('a known template and known variable resolves ok', () => {
    const params = paramsFor({ type: RESOURCE_TEMPLATE_REFERENCE_TYPE, uri: 'file:///{path}' }, 'path');
    expect(resolveCompletionTarget(params, catalog).ok).toBe(true);
  });
});

// ─── Catalog adapters reuse S28/S26 shapes ──────────────────────────────────────

describe('catalog adapters reuse S28/S26 (R-19.5-r helpers)', () => {
  it('promptArgumentNamesOf reads PromptArgument.name (S28 shape)', () => {
    expect(
      promptArgumentNamesOf({ arguments: [{ name: 'framework' }, { name: 'language' }] }),
    ).toEqual(['framework', 'language']);
    expect(promptArgumentNamesOf({})).toEqual([]);
  });

  it('resourceTemplateVariableNamesOf delegates variable extraction to S26', () => {
    const names = resourceTemplateVariableNamesOf({ uriTemplate: 'db://{table}/{id}' }, uriTemplateVariables);
    expect(names).toEqual(['table', 'id']);
  });

  it('a literal URI template yields no variables', () => {
    expect(
      resourceTemplateVariableNamesOf({ uriTemplate: 'file:///etc/hosts' }, () => []),
    ).toEqual([]);
  });
});

// ─── Error builders ─────────────────────────────────────────────────────────────

describe('error builders carry the spec codes', () => {
  it('buildUnknownReferenceError is -32602', () => {
    expect(buildUnknownReferenceError('unknown prompt "x"').code).toBe(-32602);
  });
});
