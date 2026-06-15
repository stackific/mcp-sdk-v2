/**
 * S17 conformance fixes (§11): duplicate-key rejection (RQ-4), server/client
 * capability gating (RQ-6/RQ-15), undeclared-kind error (RQ-18), and the
 * Recommended helpers — deprecated-kind preference (RC-2), loop guard (RC-3),
 * backoff (RC-5), and re-request-missing (RC-6).
 */
import { describe, it, expect } from 'vitest';
import {
  parseInputRequiredResult,
  requiredClientCapabilityForInputRequest,
  clientSupportsInputRequestKind,
  mayEmitInputRequestKind,
  discriminateResultType,
  isDeprecatedInputRequestKind,
  MrtrRoundGuard,
  computeRetryBackoffMs,
  computeMissingInputResponseKeys,
  buildReRequestInputRequiredResult,
} from '../../protocol/multi-round-trip.js';

describe('S17-RQ-4 — duplicate inputRequests keys are malformed (R-11.2-f, TV-17.10)', () => {
  it('rejects raw JSON whose inputRequests repeats a member name', () => {
    const raw =
      '{"resultType":"input_required","inputRequests":{' +
      '"k":{"method":"elicitation/create","params":{}},' +
      '"k":{"method":"roots/list"}}}';
    const result = parseInputRequiredResult(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(-32602);
  });

  it('accepts a well-formed, unique-keyed result', () => {
    const raw =
      '{"resultType":"input_required","inputRequests":{' +
      '"a":{"method":"elicitation/create","params":{}}},"requestState":"s1"}';
    const result = parseInputRequiredResult(raw);
    expect(result.ok).toBe(true);
  });

  it('does not false-positive on identical keys in sibling objects', () => {
    const raw =
      '{"resultType":"input_required","inputRequests":{' +
      '"a":{"method":"elicitation/create","params":{"x":1}},' +
      '"b":{"method":"sampling/createMessage","params":{"x":2}}}}';
    expect(parseInputRequiredResult(raw).ok).toBe(true);
  });
});

describe('S17-RQ-6 / RQ-15 — capability gating maps kind → capability', () => {
  it('maps each recognized kind to its required capability', () => {
    expect(requiredClientCapabilityForInputRequest('elicitation/create')).toBe('elicitation');
    expect(requiredClientCapabilityForInputRequest('roots/list')).toBe('roots');
    expect(requiredClientCapabilityForInputRequest('sampling/createMessage')).toBe('sampling');
    expect(requiredClientCapabilityForInputRequest('nope/whatever')).toBeUndefined();
  });

  it('server may emit only declared kinds (RQ-6)', () => {
    const caps = { elicitation: {} };
    expect(mayEmitInputRequestKind('elicitation/create', caps)).toBe(true);
    expect(mayEmitInputRequestKind('roots/list', caps)).toBe(false);
  });

  it('client supports only declared kinds (RQ-15)', () => {
    const caps = { roots: {}, sampling: {} };
    expect(clientSupportsInputRequestKind('roots/list', caps)).toBe(true);
    expect(clientSupportsInputRequestKind('elicitation/create', caps)).toBe(false);
  });
});

describe('S17-RQ-18 — undeclared kind → client treats result as error (R-11.5-k)', () => {
  const result = {
    resultType: 'input_required',
    inputRequests: { a: { method: 'elicitation/create', params: {} } },
  };

  it('errors when the requested kind was not declared', () => {
    const d = discriminateResultType(result, { roots: {} });
    expect(d.action).toBe('error');
  });

  it('fulfills when the requested kind was declared', () => {
    const d = discriminateResultType(result, { elicitation: {} });
    expect(d.action).toBe('input_required');
  });

  it('stays capability-blind (back-compat) when no capabilities are passed', () => {
    const d = discriminateResultType(result);
    expect(d.action).toBe('input_required');
  });
});

describe('S17 Recommended helpers', () => {
  it('RC-2 — flags deprecated input-request kinds', () => {
    expect(isDeprecatedInputRequestKind('roots/list')).toBe(true);
    expect(isDeprecatedInputRequestKind('sampling/createMessage')).toBe(true);
    expect(isDeprecatedInputRequestKind('elicitation/create')).toBe(false);
  });

  it('RC-3 — round guard bounds the loop', () => {
    const guard = new MrtrRoundGuard(2);
    expect(guard.recordRound()).toEqual({ ok: true, round: 1 });
    expect(guard.recordRound()).toEqual({ ok: true, round: 2 });
    expect(guard.recordRound()).toEqual({ ok: false, round: 3 });
  });

  it('RC-5 — backoff grows exponentially and is capped', () => {
    expect(computeRetryBackoffMs(0)).toBe(0);
    expect(computeRetryBackoffMs(1, { baseMs: 100 })).toBe(100);
    expect(computeRetryBackoffMs(3, { baseMs: 100 })).toBe(400);
    expect(computeRetryBackoffMs(50, { baseMs: 100, maxMs: 1000 })).toBe(1000);
  });

  it('RC-6 — re-requests only the still-missing input', () => {
    const inputRequests = {
      name: { method: 'elicitation/create' as const, params: {} },
      age: { method: 'elicitation/create' as const, params: {} },
    };
    expect(computeMissingInputResponseKeys(inputRequests, { name: { action: 'accept' } })).toEqual(['age']);

    const reReq = buildReRequestInputRequiredResult(inputRequests, { name: { action: 'accept' } }, 'state-1');
    expect(reReq).not.toBeNull();
    expect(Object.keys(reReq!.inputRequests ?? {})).toEqual(['age']);
    expect(reReq!.requestState).toBe('state-1');

    // Nothing missing ⇒ null (the server completes instead of re-requesting).
    expect(buildReRequestInputRequiredResult(inputRequests, { name: {}, age: {} })).toBeNull();
  });
});
