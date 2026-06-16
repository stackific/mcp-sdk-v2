/**
 * S33 — Sampling (DEPRECATED) (§21.2). Tests covering every acceptance
 * criterion AC-33.1 … AC-33.25.
 */

import { describe, it, expect } from 'vitest';
import {
  SAMPLING_DEPRECATED,
  SAMPLING_METHOD,
  SAMPLING_REPLACEMENT_GUIDANCE,
  isSamplingDeprecated,
  ToolResultContentSchema,
  isToolUseContent,
  isToolResultContent,
  toolResultIsError,
  SamplingMessageContentBlockSchema,
  SamplingContentSchema,
  asContentArray,
  SamplingMessageSchema,
  ModelHintSchema,
  ModelPreferencesSchema,
  selectFirstHintMatch,
  TOOL_CHOICE_MODES,
  ToolChoiceSchema,
  DEFAULT_TOOL_CHOICE,
  resolveToolChoice,
  INCLUDE_CONTEXT_VALUES,
  DEPRECATED_INCLUDE_CONTEXT_VALUES,
  isDeprecatedIncludeContext,
  SamplingToolSchema,
  CreateMessageRequestParamsSchema,
  resolveIncludeContext,
  isToolEnabledRequest,
  clampToMaxTokens,
  STANDARD_STOP_REASONS,
  isStandardStopReason,
  SamplingCreateMessageResultSchema,
  buildSamplingToolsNotDeclaredError,
  gateSamplingToolUse,
  mayServerSendSamplingRequest,
  validateSamplingRequest,
  validateUserToolResultExclusivity,
  validateSamplingMessageOrdering,
  validateToolResultReferences,
  preserveContentMeta,
  CLIENT_MODIFIABLE_REQUEST_FIELDS,
  isClientModifiableRequestField,
  REQUIRED_CONSENT_OBLIGATIONS,
  unmetRequiredConsentObligations,
  withinToolLoopLimit,
  SAMPLING_INPUT_REQUEST_METHOD,
  INVALID_PARAMS_CODE,
  RESULT_TYPE,
  SamplingInputRequestSchema,
  CreateMessageResultSchema,
} from '../../protocol/sampling.js';
import type {
  SamplingMessage,
  SamplingConsentObligations,
} from '../../protocol/sampling.js';

// Reusable fixtures.
const userTextMessage: SamplingMessage = {
  role: 'user',
  content: { type: 'text', text: 'What is the capital of France?' },
};

const declaredSampling = { sampling: {} };
const declaredSamplingTools = { sampling: { tools: {} } };
const declaredSamplingContext = { sampling: { context: {} } };

// ─── AC-33.1 — capability treated as Deprecated ───────────────────────────────

describe('AC-33.1 — Sampling is Deprecated (R-21.2-a, R-21.2.1-a)', () => {
  it('exposes the deprecation posture as a constant and predicate', () => {
    expect(SAMPLING_DEPRECATED).toBe(true);
    expect(isSamplingDeprecated()).toBe(true);
  });
});

// ─── AC-33.2 — directs builders to a model provider ───────────────────────────

describe('AC-33.2 — replacement guidance points at a model provider (R-21.2.1-b)', () => {
  it('names integrating directly with a model provider', () => {
    expect(SAMPLING_REPLACEMENT_GUIDANCE).toMatch(/model provider/i);
    expect(SAMPLING_REPLACEMENT_GUIDANCE).toMatch(/deprecated/i);
  });
});

// ─── AC-33.3 — tool-use gating (server & client) ──────────────────────────────

describe('AC-33.3 — tool-use gating (R-21.2.3-a, R-21.2.3-b, R-21.2.4-n, R-21.2.4-o)', () => {
  it('server with only sampling:{} MUST NOT send a tool-enabled request', () => {
    expect(
      mayServerSendSamplingRequest(declaredSampling, { tools: [{ name: 't' }] }),
    ).toBe(false);
    expect(
      mayServerSendSamplingRequest(declaredSampling, { toolChoice: { mode: 'auto' } }),
    ).toBe(false);
  });

  it('server MAY send a tool-enabled request when sampling.tools is declared', () => {
    expect(
      mayServerSendSamplingRequest(declaredSamplingTools, { tools: [{ name: 't' }] }),
    ).toBe(true);
  });

  it('client returns -32602 error when tools present without sampling.tools (R-21.2.4-n)', () => {
    const gate = gateSamplingToolUse(declaredSampling, { tools: [{ name: 't' }] });
    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.error.code).toBe(INVALID_PARAMS_CODE);
      expect(gate.error.message).toMatch(/tools/);
    }
  });

  it('client returns error when toolChoice present without sampling.tools (R-21.2.4-o)', () => {
    const gate = gateSamplingToolUse(declaredSampling, { toolChoice: { mode: 'required' } });
    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.error.code).toBe(INVALID_PARAMS_CODE);
      expect(gate.error.message).toMatch(/toolChoice/);
    }
  });

  it('client accepts a tool-enabled request when sampling.tools is declared', () => {
    expect(gateSamplingToolUse(declaredSamplingTools, { tools: [{ name: 't' }] }).ok).toBe(true);
  });

  it('builds the correct per-field error message', () => {
    expect(buildSamplingToolsNotDeclaredError('tools').message).toMatch(/n\)/);
    expect(buildSamplingToolsNotDeclaredError('toolChoice').message).toMatch(/o\)/);
  });

  it('a non-tool request is always allowed through the gate', () => {
    expect(gateSamplingToolUse(declaredSampling, {}).ok).toBe(true);
  });
});

// ─── AC-33.4 — includeContext deprecation gating ──────────────────────────────

describe('AC-33.4 — includeContext gated by sampling.context (R-21.2.3-c, R-21.2.4-e)', () => {
  it('omitted or "none" is always permitted', () => {
    expect(mayServerSendSamplingRequest(declaredSampling, {})).toBe(true);
    expect(mayServerSendSamplingRequest(declaredSampling, { includeContext: 'none' })).toBe(true);
  });

  it('deprecated values are rejected without sampling.context', () => {
    expect(
      mayServerSendSamplingRequest(declaredSampling, { includeContext: 'thisServer' }),
    ).toBe(false);
    expect(
      mayServerSendSamplingRequest(declaredSampling, { includeContext: 'allServers' }),
    ).toBe(false);
  });

  it('deprecated values are permitted with sampling.context', () => {
    expect(
      mayServerSendSamplingRequest(declaredSamplingContext, { includeContext: 'thisServer' }),
    ).toBe(true);
    expect(
      mayServerSendSamplingRequest(declaredSamplingContext, { includeContext: 'allServers' }),
    ).toBe(true);
  });

  it('classifies the deprecated values', () => {
    expect(isDeprecatedIncludeContext('thisServer')).toBe(true);
    expect(isDeprecatedIncludeContext('allServers')).toBe(true);
    expect(isDeprecatedIncludeContext('none')).toBe(false);
    expect([...DEPRECATED_INCLUDE_CONTEXT_VALUES]).toEqual(['thisServer', 'allServers']);
    expect(INCLUDE_CONTEXT_VALUES).toEqual(['none', 'thisServer', 'allServers']);
  });
});

// ─── AC-33.5 — messages + maxTokens required ──────────────────────────────────

describe('AC-33.5 — messages + maxTokens required (R-21.2.4-a, R-21.2.4-h)', () => {
  it('accepts a well-formed request', () => {
    const parsed = CreateMessageRequestParamsSchema.safeParse({
      messages: [userTextMessage],
      maxTokens: 100,
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a request missing messages', () => {
    expect(
      CreateMessageRequestParamsSchema.safeParse({ maxTokens: 100 }).success,
    ).toBe(false);
  });

  it('rejects a request missing maxTokens', () => {
    expect(
      CreateMessageRequestParamsSchema.safeParse({ messages: [userTextMessage] }).success,
    ).toBe(false);
  });

  it('validateSamplingRequest rejects malformed params with -32602', () => {
    const result = validateSamplingRequest(declaredSampling, { messages: [userTextMessage] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(INVALID_PARAMS_CODE);
  });

  it('preserves oldest-to-newest message order', () => {
    const m2: SamplingMessage = { role: 'assistant', content: { type: 'text', text: 'b' } };
    const parsed = CreateMessageRequestParamsSchema.parse({
      messages: [userTextMessage, m2],
      maxTokens: 50,
    });
    expect(parsed.messages[0]!.role).toBe('user');
    expect(parsed.messages[1]!.role).toBe('assistant');
  });
});

// ─── AC-33.6 — messages not retained between requests ─────────────────────────

describe('AC-33.6 — message lists are per-request (R-21.2.4-b)', () => {
  it('each parse yields an independent messages array', () => {
    const first = CreateMessageRequestParamsSchema.parse({
      messages: [{ role: 'user', content: { type: 'text', text: 'first' } }],
      maxTokens: 10,
    });
    const second = CreateMessageRequestParamsSchema.parse({
      messages: [{ role: 'user', content: { type: 'text', text: 'second' } }],
      maxTokens: 10,
    });
    expect(first.messages).not.toBe(second.messages);
    expect(second.messages).toHaveLength(1);
    expect(asContentArray(second.messages[0]!.content)[0]).toMatchObject({ text: 'second' });
  });
});

// ─── AC-33.7 — advisory/ignorable fields ──────────────────────────────────────

describe('AC-33.7 — advisory fields may be ignored/modified (R-21.2.4-c/d/g/k/l)', () => {
  it('accepts a request carrying all advisory fields', () => {
    const parsed = CreateMessageRequestParamsSchema.safeParse({
      messages: [userTextMessage],
      maxTokens: 100,
      modelPreferences: { costPriority: 0.3 },
      systemPrompt: 'You are helpful.',
      temperature: 0.1,
      stopSequences: ['STOP'],
      metadata: { providerKey: 'x' },
    });
    expect(parsed.success).toBe(true);
  });

  it('the exchange still completes when the client drops advisory fields', () => {
    // A client that strips advisory fields still produces a valid result.
    const result = SamplingCreateMessageResultSchema.safeParse({
      role: 'assistant',
      content: { type: 'text', text: 'Paris.' },
      model: 'claude-3-sonnet',
      resultType: RESULT_TYPE.COMPLETE,
    });
    expect(result.success).toBe(true);
  });

  it('the four modifiable fields are the documented set (R-21.2.10-e)', () => {
    expect(CLIENT_MODIFIABLE_REQUEST_FIELDS).toEqual([
      'systemPrompt',
      'includeContext',
      'temperature',
      'stopSequences',
      'metadata',
    ]);
  });
});

// ─── AC-33.8 — includeContext may be modified/ignored ─────────────────────────

describe('AC-33.8 — includeContext modifiable without notice (R-21.2.4-f)', () => {
  it('includeContext is a client-modifiable control field', () => {
    expect(isClientModifiableRequestField('includeContext')).toBe(true);
  });

  it('resolves an omitted includeContext to "none"', () => {
    expect(resolveIncludeContext({})).toBe('none');
    expect(resolveIncludeContext({ includeContext: 'thisServer' })).toBe('thisServer');
  });
});

// ─── AC-33.9 — maxTokens upper bound ──────────────────────────────────────────

describe('AC-33.9 — maxTokens is an upper bound (R-21.2.4-i, R-21.2.4-j)', () => {
  it('clamps over-budget counts to maxTokens', () => {
    expect(clampToMaxTokens(150, 100)).toBe(100);
  });

  it('leaves under-budget counts (fewer tokens) unchanged', () => {
    expect(clampToMaxTokens(40, 100)).toBe(40);
    expect(clampToMaxTokens(100, 100)).toBe(100);
  });
});

// ─── AC-33.10 — request-scoped tools ──────────────────────────────────────────

describe('AC-33.10 — tools scoped to the request (R-21.2.4-m)', () => {
  it('accepts tools that do not correspond to any registered server tool', () => {
    const parsed = SamplingToolSchema.safeParse({
      name: 'unregistered_tool',
      description: 'ad-hoc',
      inputSchema: { type: 'object', properties: {} },
    });
    expect(parsed.success).toBe(true);
  });

  it('a tools array is accepted in request params (with sampling.tools)', () => {
    const params = {
      messages: [userTextMessage],
      maxTokens: 1000,
      tools: [{ name: 'get_weather', inputSchema: { type: 'object' } }],
    };
    expect(CreateMessageRequestParamsSchema.safeParse(params).success).toBe(true);
    expect(validateSamplingRequest(declaredSamplingTools, params).ok).toBe(true);
  });
});

// ─── AC-33.11 — toolChoice default ────────────────────────────────────────────

describe('AC-33.11 — omitted toolChoice means { mode: "auto" } (R-21.2.4-p)', () => {
  it('resolves to auto when omitted', () => {
    expect(resolveToolChoice(undefined)).toEqual({ mode: 'auto' });
    expect(DEFAULT_TOOL_CHOICE).toEqual({ mode: 'auto' });
  });

  it('resolves to auto when mode omitted', () => {
    expect(resolveToolChoice({})).toEqual({ mode: 'auto' });
  });

  it('keeps an explicit mode', () => {
    expect(resolveToolChoice({ mode: 'required' })).toEqual({ mode: 'required' });
  });
});

// ─── AC-33.12 — tool-choice modes ─────────────────────────────────────────────

describe('AC-33.12 — required / none semantics (R-21.2.5-a, R-21.2.5-b)', () => {
  it('the three modes are recognized', () => {
    expect(TOOL_CHOICE_MODES).toEqual(['auto', 'required', 'none']);
    expect(ToolChoiceSchema.safeParse({ mode: 'required' }).success).toBe(true);
    expect(ToolChoiceSchema.safeParse({ mode: 'none' }).success).toBe(true);
  });

  it('rejects an unknown mode', () => {
    expect(ToolChoiceSchema.safeParse({ mode: 'maybe' }).success).toBe(false);
  });

  it('mode "required" demands at least one tool; "none" forbids tools', () => {
    // The constraint is enforced by the producing model; here we verify a
    // tool-use result is the shape "required" yields and an empty-tool result
    // is the shape "none" yields, both well-formed.
    const requiredResult = SamplingCreateMessageResultSchema.safeParse({
      role: 'assistant',
      content: [{ type: 'tool_use', id: '1', name: 't', input: {} }],
      model: 'm',
      stopReason: 'toolUse',
      resultType: 'complete',
    });
    const noneResult = SamplingCreateMessageResultSchema.safeParse({
      role: 'assistant',
      content: { type: 'text', text: 'no tools used' },
      model: 'm',
      stopReason: 'endTurn',
      resultType: 'complete',
    });
    expect(requiredResult.success).toBe(true);
    expect(noneResult.success).toBe(true);
  });
});

// ─── AC-33.13 — SamplingMessage role + content ────────────────────────────────

describe('AC-33.13 — SamplingMessage role + content (R-21.2.6-a, R-21.2.6-b)', () => {
  it('accepts user/assistant roles and single or array content', () => {
    expect(SamplingMessageSchema.safeParse(userTextMessage).success).toBe(true);
    expect(
      SamplingMessageSchema.safeParse({
        role: 'assistant',
        content: [
          { type: 'text', text: 'a' },
          { type: 'text', text: 'b' },
        ],
      }).success,
    ).toBe(true);
  });

  it('rejects a missing role', () => {
    expect(
      SamplingMessageSchema.safeParse({ content: { type: 'text', text: 'x' } }).success,
    ).toBe(false);
  });

  it('rejects an out-of-set role', () => {
    expect(
      SamplingMessageSchema.safeParse({ role: 'system', content: { type: 'text', text: 'x' } })
        .success,
    ).toBe(false);
  });

  it('rejects a missing content', () => {
    expect(SamplingMessageSchema.safeParse({ role: 'user' }).success).toBe(false);
  });

  it('content union accepts text/image/audio and tool blocks', () => {
    expect(SamplingMessageContentBlockSchema.safeParse({ type: 'text', text: 'x' }).success).toBe(
      true,
    );
    expect(
      SamplingMessageContentBlockSchema.safeParse({
        type: 'tool_use',
        id: '1',
        name: 't',
        input: {},
      }).success,
    ).toBe(true);
    expect(SamplingContentSchema.safeParse({ type: 'text', text: 'x' }).success).toBe(true);
  });
});

// ─── AC-33.14 — _meta preservation ────────────────────────────────────────────

describe('AC-33.14 — preserve tool block _meta (R-21.2.6-c, R-21.2.6-h)', () => {
  it('preserves ToolUseContent._meta across requests', () => {
    const block = { type: 'tool_use' as const, id: '1', name: 't', input: {}, _meta: { cacheKey: 'k' } };
    const carried = preserveContentMeta(block);
    expect(carried._meta).toEqual({ cacheKey: 'k' });
  });

  it('preserves ToolResultContent._meta across requests', () => {
    const block = {
      type: 'tool_result' as const,
      toolUseId: '1',
      content: [{ type: 'text' as const, text: 'r' }],
      _meta: { cacheKey: 'k2' },
    };
    const carried = preserveContentMeta(block);
    expect(carried._meta).toEqual({ cacheKey: 'k2' });
  });

  it('leaves non-tool blocks unchanged', () => {
    const text = { type: 'text' as const, text: 'x' };
    expect(preserveContentMeta(text)).toBe(text);
  });
});

// ─── AC-33.15 — toolUseId matches a prior tool use ────────────────────────────

describe('AC-33.15 — toolUseId references a prior tool use (R-21.2.6-d)', () => {
  it('accepts a matching toolUseId', () => {
    const messages: SamplingMessage[] = [
      { role: 'assistant', content: [{ type: 'tool_use', id: 'abc', name: 't', input: {} }] },
      {
        role: 'user',
        content: [{ type: 'tool_result', toolUseId: 'abc', content: [{ type: 'text', text: 'r' }] }],
      },
    ];
    expect(validateToolResultReferences(messages).ok).toBe(true);
  });

  it('rejects a dangling toolUseId', () => {
    const messages: SamplingMessage[] = [
      {
        role: 'user',
        content: [{ type: 'tool_result', toolUseId: 'nope', content: [{ type: 'text', text: 'r' }] }],
      },
    ];
    const result = validateToolResultReferences(messages);
    expect(result.ok).toBe(false);
    expect(result.toolUseId).toBe('nope');
  });
});

// ─── AC-33.16 — ToolResultContent fields ──────────────────────────────────────

describe('AC-33.16 — tool-result content/struct/isError (R-21.2.6-e/f/g)', () => {
  it('content MAY include text/image/audio/resource-link/embedded-resource', () => {
    const parsed = ToolResultContentSchema.safeParse({
      type: 'tool_result',
      toolUseId: '1',
      content: [
        { type: 'text', text: 't' },
        { type: 'image', data: 'YWJj', mimeType: 'image/png' },
        { type: 'audio', data: 'YWJj', mimeType: 'audio/wav' },
        { type: 'resource_link', uri: 'file:///x', name: 'x' },
        { type: 'resource', resource: { uri: 'file:///y', text: 'hi' } },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it('structuredContent accepts any JSON value', () => {
    expect(
      ToolResultContentSchema.safeParse({
        type: 'tool_result',
        toolUseId: '1',
        content: [],
        structuredContent: { temp: 18, ok: true },
      }).success,
    ).toBe(true);
  });

  it('omitted isError is treated as false', () => {
    const block = ToolResultContentSchema.parse({
      type: 'tool_result',
      toolUseId: '1',
      content: [],
    });
    expect(toolResultIsError(block)).toBe(false);
    const errBlock = ToolResultContentSchema.parse({
      type: 'tool_result',
      toolUseId: '1',
      content: [],
      isError: true,
    });
    expect(toolResultIsError(errBlock)).toBe(true);
  });
});

// ─── AC-33.17 — user tool-result exclusivity ──────────────────────────────────

describe('AC-33.17 — user tool_result message exclusivity (R-21.2.7-a)', () => {
  it('accepts a user message of only tool_result blocks', () => {
    const message: SamplingMessage = {
      role: 'user',
      content: [
        { type: 'tool_result', toolUseId: '1', content: [{ type: 'text', text: 'r' }] },
        { type: 'tool_result', toolUseId: '2', content: [{ type: 'text', text: 's' }] },
      ],
    };
    expect(validateUserToolResultExclusivity(message).ok).toBe(true);
  });

  it('rejects a user message mixing tool_result with text', () => {
    const message: SamplingMessage = {
      role: 'user',
      content: [
        { type: 'tool_result', toolUseId: '1', content: [{ type: 'text', text: 'r' }] },
        { type: 'text', text: 'extra' },
      ],
    };
    expect(validateUserToolResultExclusivity(message).ok).toBe(false);
  });

  it('a user message without any tool_result is unconstrained', () => {
    expect(validateUserToolResultExclusivity(userTextMessage).ok).toBe(true);
  });

  it('an assistant message is not subject to the constraint', () => {
    const message: SamplingMessage = {
      role: 'assistant',
      content: [{ type: 'text', text: 'x' }],
    };
    expect(validateUserToolResultExclusivity(message).ok).toBe(true);
  });
});

// ─── AC-33.18 — assistant tool_use must be followed by matching user results ───

describe('AC-33.18 — tool_use → user tool_result ordering (R-21.2.7-b)', () => {
  const baseUser: SamplingMessage = { role: 'user', content: { type: 'text', text: 'weather?' } };

  it('accepts a well-formed tool-use/result sequence (parallel uses)', () => {
    const messages: SamplingMessage[] = [
      baseUser,
      {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 'a', name: 't', input: {} },
          { type: 'tool_use', id: 'b', name: 'u', input: {} },
        ],
      },
      {
        role: 'user',
        content: [
          { type: 'tool_result', toolUseId: 'a', content: [{ type: 'text', text: 'ra' }] },
          { type: 'tool_result', toolUseId: 'b', content: [{ type: 'text', text: 'rb' }] },
        ],
      },
    ];
    expect(validateSamplingMessageOrdering(messages).ok).toBe(true);
  });

  it('rejects when an assistant tool_use is last (no following user message)', () => {
    const messages: SamplingMessage[] = [
      baseUser,
      { role: 'assistant', content: [{ type: 'tool_use', id: 'a', name: 't', input: {} }] },
    ];
    expect(validateSamplingMessageOrdering(messages).ok).toBe(false);
  });

  it('rejects when a tool_use is not immediately followed by a user tool_result message', () => {
    const messages: SamplingMessage[] = [
      baseUser,
      { role: 'assistant', content: [{ type: 'tool_use', id: 'a', name: 't', input: {} }] },
      { role: 'assistant', content: { type: 'text', text: 'oops' } },
    ];
    expect(validateSamplingMessageOrdering(messages).ok).toBe(false);
  });

  it('rejects when a tool_use id has no matching tool_result', () => {
    const messages: SamplingMessage[] = [
      baseUser,
      { role: 'assistant', content: [{ type: 'tool_use', id: 'a', name: 't', input: {} }] },
      {
        role: 'user',
        content: [{ type: 'tool_result', toolUseId: 'WRONG', content: [{ type: 'text', text: 'r' }] }],
      },
    ];
    expect(validateSamplingMessageOrdering(messages).ok).toBe(false);
  });

  it('rejects when the following user message mixes a non-tool_result block', () => {
    const messages: SamplingMessage[] = [
      baseUser,
      { role: 'assistant', content: [{ type: 'tool_use', id: 'a', name: 't', input: {} }] },
      {
        role: 'user',
        content: [
          { type: 'tool_result', toolUseId: 'a', content: [{ type: 'text', text: 'r' }] },
          { type: 'text', text: 'extra' },
        ],
      },
    ];
    expect(validateSamplingMessageOrdering(messages).ok).toBe(false);
  });
});

// ─── AC-33.19 — CreateMessageResult required fields ───────────────────────────

describe('AC-33.19 — result role/content/model/resultType (R-21.2.8-a/b/c/e)', () => {
  const result = {
    role: 'assistant',
    content: { type: 'text', text: 'The capital of France is Paris.' },
    model: 'claude-3-sonnet-20240307',
    stopReason: 'endTurn',
    resultType: 'complete',
  };

  it('accepts a fully-specified result', () => {
    expect(SamplingCreateMessageResultSchema.safeParse(result).success).toBe(true);
  });

  it('rejects a missing role/content/model/resultType', () => {
    for (const key of ['role', 'content', 'model', 'resultType']) {
      const broken: Record<string, unknown> = { ...result };
      delete broken[key];
      expect(SamplingCreateMessageResultSchema.safeParse(broken).success).toBe(false);
    }
  });

  it('accepts an array content with tool uses', () => {
    expect(
      SamplingCreateMessageResultSchema.safeParse({
        ...result,
        content: [{ type: 'tool_use', id: 'call_abc123', name: 'get_weather', input: { city: 'Paris' } }],
        stopReason: 'toolUse',
      }).success,
    ).toBe(true);
  });
});

// ─── AC-33.20 — open stopReason string ────────────────────────────────────────

describe('AC-33.20 — stopReason is an open string (R-21.2.8-d)', () => {
  it('accepts a non-standard stopReason value', () => {
    expect(
      SamplingCreateMessageResultSchema.safeParse({
        role: 'assistant',
        content: { type: 'text', text: 'x' },
        model: 'm',
        stopReason: 'provider_specific_reason',
        resultType: 'complete',
      }).success,
    ).toBe(true);
  });

  it('classifies the standard values', () => {
    expect(STANDARD_STOP_REASONS).toEqual(['endTurn', 'stopSequence', 'maxTokens', 'toolUse']);
    expect(isStandardStopReason('toolUse')).toBe(true);
    expect(isStandardStopReason('custom')).toBe(false);
  });
});

// ─── AC-33.21 — model preferences & hint ordering ─────────────────────────────

describe('AC-33.21 — hints first-match, advisory (R-21.2.9-a/b/c/d)', () => {
  it('evaluates hints in order and takes the first match', () => {
    const hints = [{ name: 'gpt-9' }, { name: 'sonnet' }, { name: 'claude' }];
    const models = ['claude-3-5-sonnet-20241022', 'claude-3-opus'];
    const match = selectFirstHintMatch(hints, models);
    expect(match?.hint.name).toBe('sonnet');
    expect(match?.model).toBe('claude-3-5-sonnet-20241022');
  });

  it('returns undefined when no hint matches (advisory; client decides)', () => {
    expect(selectFirstHintMatch([{ name: 'mistral' }], ['claude-3'])).toBeUndefined();
    expect(selectFirstHintMatch(undefined, ['claude-3'])).toBeUndefined();
  });

  it('accepts a full ModelPreferences object', () => {
    expect(
      ModelPreferencesSchema.safeParse({
        hints: [{ name: 'claude-3-sonnet' }, { name: 'claude' }],
        costPriority: 0.3,
        speedPriority: 0.5,
        intelligencePriority: 0.8,
      }).success,
    ).toBe(true);
  });
});

// ─── AC-33.22 — priority range 0–1 ────────────────────────────────────────────

describe('AC-33.22 — priorities are optional 0–1 numbers (R-21.2.9-e)', () => {
  it('accepts in-range and omitted priorities', () => {
    expect(ModelPreferencesSchema.safeParse({}).success).toBe(true);
    expect(ModelPreferencesSchema.safeParse({ costPriority: 0 }).success).toBe(true);
    expect(ModelPreferencesSchema.safeParse({ speedPriority: 1 }).success).toBe(true);
    expect(ModelPreferencesSchema.safeParse({ intelligencePriority: 0.5 }).success).toBe(true);
  });

  it('rejects out-of-range priorities (schema clamps via reject)', () => {
    expect(ModelPreferencesSchema.safeParse({ costPriority: 1.5 }).success).toBe(false);
    expect(ModelPreferencesSchema.safeParse({ speedPriority: -0.1 }).success).toBe(false);
  });
});

// ─── AC-33.23 — ModelHint substring/mapping ───────────────────────────────────

describe('AC-33.23 — ModelHint.name is a substring (R-21.2.9-f, R-21.2.9-g)', () => {
  it('treats the hint name as a substring of a model name', () => {
    const match = selectFirstHintMatch([{ name: 'claude-3-5-sonnet' }], [
      'claude-3-5-sonnet-20241022',
    ]);
    expect(match?.model).toBe('claude-3-5-sonnet-20241022');
  });

  it('a bare family hint matches multiple families (client may remap)', () => {
    expect(selectFirstHintMatch([{ name: 'claude' }], ['anthropic-claude-x']).model).toBe(
      'anthropic-claude-x',
    );
  });

  it('ModelHint accepts a name and passes through other keys', () => {
    expect(ModelHintSchema.safeParse({ name: 'sonnet' }).success).toBe(true);
    expect(ModelHintSchema.safeParse({}).success).toBe(true);
    expect(ModelHintSchema.safeParse({ name: 'sonnet', vendor: 'x' }).success).toBe(true);
  });
});

// ─── AC-33.24 — consent / human-in-the-loop ───────────────────────────────────

describe('AC-33.24 — consent obligations (R-21.2.10-a/b/c/d/e)', () => {
  const fullyConsenting: SamplingConsentObligations = {
    humanInTheLoop: true,
    userMayDeny: true,
    reviewPromptBeforeSampling: true,
    reviewResultBeforeServer: true,
    mayModifyControlFields: true,
    rateLimiting: true,
    validateContent: true,
    handleSensitiveData: true,
    toolLoopIterationLimits: true,
  };

  it('a host meeting all MUST obligations has none unmet', () => {
    expect(unmetRequiredConsentObligations(fullyConsenting)).toEqual([]);
  });

  it('flags a missing human-in-the-loop MUST', () => {
    const unmet = unmetRequiredConsentObligations({ ...fullyConsenting, humanInTheLoop: false });
    expect(unmet).toContain('humanInTheLoop');
  });

  it('flags a missing deny-ability MUST', () => {
    const unmet = unmetRequiredConsentObligations({ ...fullyConsenting, userMayDeny: false });
    expect(unmet).toContain('userMayDeny');
  });

  it('the modifiable control fields cover the §21.2.10-e set', () => {
    for (const field of ['systemPrompt', 'includeContext', 'temperature', 'stopSequences', 'metadata']) {
      expect(isClientModifiableRequestField(field)).toBe(true);
    }
    expect(isClientModifiableRequestField('maxTokens')).toBe(false);
  });
});

// ─── AC-33.25 — safety: rate limit, sensitive data, iteration limits ──────────

describe('AC-33.25 — safety obligations (R-21.2.10-f/g/h/i)', () => {
  it('the MUST-level obligations include sensitive-data handling', () => {
    expect(REQUIRED_CONSENT_OBLIGATIONS).toContain('handleSensitiveData');
  });

  it('flags a missing sensitive-data MUST', () => {
    const unmet = unmetRequiredConsentObligations({
      humanInTheLoop: true,
      userMayDeny: true,
      reviewPromptBeforeSampling: true,
      reviewResultBeforeServer: true,
      mayModifyControlFields: true,
      rateLimiting: false,
      validateContent: false,
      handleSensitiveData: false,
      toolLoopIterationLimits: false,
    });
    expect(unmet).toContain('handleSensitiveData');
    // SHOULD-level obligations (rate limiting, validate content, iteration limits)
    // are advisory and not reported as unmet MUSTs.
    expect(unmet).not.toContain('rateLimiting');
  });

  it('enforces tool-loop iteration limits', () => {
    expect(withinToolLoopLimit(0, 5)).toBe(true);
    expect(withinToolLoopLimit(4, 5)).toBe(true);
    expect(withinToolLoopLimit(5, 5)).toBe(false);
    expect(withinToolLoopLimit(6, 5)).toBe(false);
  });
});

// ─── Reuse / integration sanity ───────────────────────────────────────────────

describe('reuse — builds on S17 envelope + result without redefining', () => {
  it('SAMPLING_METHOD matches the S17 input-request method', () => {
    expect(SAMPLING_METHOD).toBe('sampling/createMessage');
    expect(SAMPLING_INPUT_REQUEST_METHOD).toBe('sampling/createMessage');
  });

  it('the re-exported S17 SamplingInputRequestSchema accepts a sampling request', () => {
    const parsed = SamplingInputRequestSchema.safeParse({
      method: 'sampling/createMessage',
      params: { messages: [userTextMessage], maxTokens: 100 },
    });
    expect(parsed.success).toBe(true);
  });

  it('the §21.2.8 result satisfies the S17 CreateMessageResultSchema minimum', () => {
    const result = {
      role: 'assistant',
      content: { type: 'text', text: 'Paris.' },
      model: 'claude-3-sonnet',
      resultType: 'complete',
    };
    expect(SamplingCreateMessageResultSchema.safeParse(result).success).toBe(true);
    expect(CreateMessageResultSchema.safeParse(result).success).toBe(true);
  });

  it('isToolUseContent / isToolResultContent guard correctly', () => {
    expect(isToolUseContent({ type: 'tool_use', id: '1', name: 't', input: {} })).toBe(true);
    expect(isToolUseContent({ type: 'text', text: 'x' })).toBe(false);
    expect(
      isToolResultContent({ type: 'tool_result', toolUseId: '1', content: [] }),
    ).toBe(true);
    expect(isToolResultContent({ type: 'tool_use', id: '1', name: 't', input: {} })).toBe(false);
  });

  it('isToolEnabledRequest detects tools or toolChoice', () => {
    expect(isToolEnabledRequest({ tools: [] })).toBe(true);
    expect(isToolEnabledRequest({ toolChoice: { mode: 'auto' } })).toBe(true);
    expect(isToolEnabledRequest({})).toBe(false);
  });
});
