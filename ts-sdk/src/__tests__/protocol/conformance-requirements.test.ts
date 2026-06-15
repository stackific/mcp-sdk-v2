/**
 * S45 — Conformance Requirements & References (§29–§30).
 *
 * One or more cases per numbered acceptance criterion (AC-45.1 – AC-45.39).
 * The story is conceptual: these assert the data structures and predicates that
 * model conformance — the requirement registry, the requirement-level classifier,
 * the profile descriptor + validator, the baseline server request disposition,
 * the capability→obligation map, the robustness disposition, the stateless
 * invariants, the transport-conformance evaluator, and the §30 citation status.
 */

import { describe, it, expect } from 'vitest';
import {
  // axes & roles
  CONFORMANCE_AXES,
  // requirement levels
  REQUIREMENT_LEVELS,
  REQUIREMENT_KEYWORDS,
  classifyRequirementLevel,
  isMandatoryKeyword,
  isAdvisoryKeyword,
  isOptionalKeyword,
  // requirement registry
  CONFORMANCE_REQUIREMENTS,
  lookupRequirement,
  requirementsForAxis,
  requirementsForRole,
  // capability obligations
  CAPABILITY_OBLIGATIONS,
  obligationForCapability,
  obligedSectionsForCapabilities,
  // baseline server disposition
  classifyServerRequest,
  validateSuccessResultType,
  // baseline client
  clientRequestCarriesBaselineEnvelope,
  REQUIRED_CLIENT_REQUEST_META_KEYS,
  validateInputRequiredRetry,
  // no unsolicited input requests
  INPUT_REQUEST_REQUIRED_CAPABILITY,
  mayPlaceInputRequest,
  // robustness
  robustnessDisposition,
  decideResultAction,
  // stateless
  STATELESS_CONFORMANCE_INVARIANTS,
  decideRequestStateHandling,
  // transport
  STREAMABLE_HTTP_NEGOTIATION_ERROR_STATUS,
  streamableHttpStatusForProtocolError,
  evaluateTransportConformance,
  // profile
  validateConformanceProfile,
  profileSupportsRevision,
  requirementsForProfile,
  satisfiesRole,
  isFeatureFullyConformant,
  // references
  CITATION_STATUS,
  isCitationLoadBearing,
  type ConformanceProfile,
} from '../../protocol/conformance-requirements.js';
import { CURRENT_PROTOCOL_VERSION } from '../../protocol/meta.js';
import { UNSUPPORTED_PROTOCOL_VERSION_CODE, MISSING_CLIENT_CAPABILITY_CODE, INVALID_PARAMS_CODE } from '../../protocol/errors.js';
import { RESULT_TYPE } from '../../jsonrpc/payload.js';

/** Builds a well-formed §4 client request `_meta` envelope. */
function baselineMeta(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    'io.modelcontextprotocol/protocolVersion': CURRENT_PROTOCOL_VERSION,
    'io.modelcontextprotocol/clientInfo': { name: 'c', version: '1.0.0' },
    'io.modelcontextprotocol/clientCapabilities': {},
    ...overrides,
  };
}

const SUPPORTED = [CURRENT_PROTOCOL_VERSION];

describe('S45 conformance — registry, axes, and requirement levels', () => {
  it('every requirement’s level matches the canonical family for its keyword', () => {
    for (const r of CONFORMANCE_REQUIREMENTS) {
      expect(r.level).toBe(REQUIREMENT_KEYWORDS[r.keyword]);
      expect(REQUIREMENT_LEVELS).toContain(r.level);
    }
  });

  it('exposes the three conformance axes in order and every requirement uses one', () => {
    expect(CONFORMANCE_AXES).toEqual(['role', 'feature', 'transport']);
    for (const r of CONFORMANCE_REQUIREMENTS) {
      expect(CONFORMANCE_AXES).toContain(r.axis);
    }
  });

  it('lookupRequirement resolves a known id and rejects an unknown one', () => {
    expect(lookupRequirement('R-29.2-h')?.section).toBe('29.2');
    expect(lookupRequirement('R-99.9-z')).toBeUndefined();
  });

  it('requirementsForAxis / requirementsForRole partition correctly', () => {
    const transportReqs = requirementsForAxis('transport');
    expect(transportReqs.map((r) => r.id)).toContain('R-29.8-a');
    expect(transportReqs.every((r) => r.axis === 'transport')).toBe(true);

    const serverReqs = requirementsForRole('server');
    // R-29.2-a binds the server; R-29.3-a (client-only) does not.
    expect(serverReqs.map((r) => r.id)).toContain('R-29.2-a');
    expect(serverReqs.map((r) => r.id)).not.toContain('R-29.3-a');
    // A both-roles atom (empty roles) binds the server too.
    expect(serverReqs.map((r) => r.id)).toContain('R-29.1-c');
  });
});

describe('S45 conformance — requirement-level classifier (RFC 2119 / §2)', () => {
  it('classifies the MUST family', () => {
    for (const kw of ['MUST', 'MUST NOT', 'REQUIRED', 'SHALL', 'SHALL NOT']) {
      expect(classifyRequirementLevel(kw)).toBe('MUST');
      expect(isMandatoryKeyword(kw)).toBe(true);
      expect(isAdvisoryKeyword(kw)).toBe(false);
      expect(isOptionalKeyword(kw)).toBe(false);
    }
  });

  it('classifies the SHOULD family', () => {
    for (const kw of ['SHOULD', 'SHOULD NOT', 'RECOMMENDED']) {
      expect(classifyRequirementLevel(kw)).toBe('SHOULD');
      expect(isAdvisoryKeyword(kw)).toBe(true);
    }
  });

  it('classifies the MAY / OPTIONAL family', () => {
    for (const kw of ['MAY', 'OPTIONAL']) {
      expect(classifyRequirementLevel(kw)).toBe('MAY');
      expect(isOptionalKeyword(kw)).toBe(true);
    }
  });

  it('returns undefined for an unrecognized keyword without throwing', () => {
    expect(classifyRequirementLevel('WIBBLE')).toBeUndefined();
    expect(isMandatoryKeyword('WIBBLE')).toBe(false);
  });
});

describe('AC-45.1 — both-role implementation must satisfy each role', () => {
  it('a both-role implementation is conformant only if it satisfies each role (R-29.1-a, R-29.1-b)', () => {
    expect(satisfiesRole(['client', 'server'], 'client')).toBe(true);
    expect(satisfiesRole(['client', 'server'], 'server')).toBe(true);
    // satisfying only the server role is non-conformant for the client role
    expect(satisfiesRole(['server'], 'client')).toBe(false);
    expect(satisfiesRole(['client'], 'server')).toBe(false);
  });

  it('requirementsForProfile includes both roles’ baseline atoms for a both-role profile', () => {
    const profile: ConformanceProfile = {
      roles: ['client', 'server'],
      revisions: SUPPORTED,
      capabilities: [],
      extensions: [],
      transports: ['stdio'],
    };
    const ids = requirementsForProfile(profile).map((r) => r.id);
    expect(ids).toContain('R-29.2-a'); // server baseline
    expect(ids).toContain('R-29.3-a'); // client baseline
  });
});

describe('AC-45.2 — base message format & self-contained envelope', () => {
  it('the §3/§4 message-format requirements are present and mandatory (R-29.1-c, R-29.1-d)', () => {
    expect(lookupRequirement('R-29.1-c')?.keyword).toBe('MUST');
    expect(lookupRequirement('R-29.1-d')?.keyword).toBe('MUST');
  });

  it('a well-formed self-contained envelope passes the baseline check', () => {
    expect(clientRequestCarriesBaselineEnvelope(baselineMeta())).toBe(true);
    expect(REQUIRED_CLIENT_REQUEST_META_KEYS).toEqual([
      'io.modelcontextprotocol/protocolVersion',
      'io.modelcontextprotocol/clientInfo',
      'io.modelcontextprotocol/clientCapabilities',
    ]);
  });
});

describe('AC-45.3 — no state derived from connection identity', () => {
  it('a second request omitting a field present in the first is judged on its own envelope (R-29.1-e)', () => {
    // First request fully formed.
    expect(classifyServerRequest({ meta: baselineMeta(), serverSupportedRevisions: SUPPORTED }).ok).toBe(true);
    // Second request on the "same connection" omits clientCapabilities — it is NOT
    // reused from the first; the second is rejected on its own merits.
    const second = baselineMeta();
    delete second['io.modelcontextprotocol/clientCapabilities'];
    const disp = classifyServerRequest({ meta: second, serverSupportedRevisions: SUPPORTED });
    expect(disp.ok).toBe(false);
    if (!disp.ok) expect(disp.stage).toBe('envelope');
  });

  it('the requirement is MUST NOT', () => {
    expect(lookupRequirement('R-29.1-e')?.keyword).toBe('MUST NOT');
  });
});

describe('AC-45.4 — conformance judged on wire behavior only', () => {
  it('R-29.1-f and R-29.9-a are MAY (architecture/language are unconstrained)', () => {
    expect(lookupRequirement('R-29.1-f')?.keyword).toBe('MAY');
    expect(lookupRequirement('R-29.9-a')?.keyword).toBe('MAY');
  });

  it('two requests with identical envelopes reach identical dispositions', () => {
    const a = classifyServerRequest({ meta: baselineMeta(), serverSupportedRevisions: SUPPORTED });
    const b = classifyServerRequest({ meta: baselineMeta(), serverSupportedRevisions: SUPPORTED });
    expect(a).toEqual(b);
  });
});

describe('AC-45.5 / AC-45.6 — discovery is unconditional; advertisement consistent', () => {
  it('server/discover obligation is MUST and the client call is MAY (R-29.2-a, R-29.2-b)', () => {
    expect(lookupRequirement('R-29.2-a')?.keyword).toBe('MUST');
    expect(lookupRequirement('R-29.2-b')?.keyword).toBe('MAY');
  });

  it('advertise-consistency and never-advertise-the-unimplemented are present (R-29.2-c, R-29.2-d)', () => {
    expect(lookupRequirement('R-29.2-c')?.keyword).toBe('MUST');
    expect(lookupRequirement('R-29.2-d')?.keyword).toBe('MUST NOT');
  });
});

describe('AC-45.7 — per-request metadata honored; no cross-request state', () => {
  it('a well-formed request is accepted (R-29.2-e)', () => {
    expect(classifyServerRequest({ meta: baselineMeta(), serverSupportedRevisions: SUPPORTED }).ok).toBe(true);
  });

  it('the no-cross-request-state and no-connection-reuse atoms are MUST NOT (R-29.2-f, R-29.2-g)', () => {
    expect(lookupRequirement('R-29.2-f')?.keyword).toBe('MUST NOT');
    expect(lookupRequirement('R-29.2-g')?.keyword).toBe('MUST NOT');
  });
});

describe('AC-45.8 — unsupported revision rejected with -32004', () => {
  it('rejects with -32004 carrying supported + requested (R-29.2-h)', () => {
    const meta = baselineMeta({ 'io.modelcontextprotocol/protocolVersion': '2025-01-01' });
    const disp = classifyServerRequest({ meta, serverSupportedRevisions: SUPPORTED });
    expect(disp.ok).toBe(false);
    if (!disp.ok && disp.stage === 'revision') {
      expect(disp.code).toBe(UNSUPPORTED_PROTOCOL_VERSION_CODE);
      expect(disp.data.supported).toEqual(SUPPORTED);
      expect(disp.data.requested).toBe('2025-01-01');
    } else {
      throw new Error('expected a revision rejection');
    }
  });

  it('a malformed (non-YYYY-MM-DD) version is an envelope failure, not a -32004', () => {
    const meta = baselineMeta({ 'io.modelcontextprotocol/protocolVersion': 'not-a-date' });
    const disp = classifyServerRequest({ meta, serverSupportedRevisions: SUPPORTED });
    expect(disp.ok).toBe(false);
    if (!disp.ok) expect(disp.stage).toBe('envelope');
  });
});

describe('AC-45.9 — undeclared required capability rejected with -32003', () => {
  it('rejects with -32003 whose data.requiredCapabilities enumerates the needed caps (R-29.2-i, R-29.4-k)', () => {
    const disp = classifyServerRequest({
      meta: baselineMeta(),
      serverSupportedRevisions: SUPPORTED,
      requiredClientCapabilities: { elicitation: {} },
    });
    expect(disp.ok).toBe(false);
    if (!disp.ok && disp.stage === 'capability') {
      expect(disp.code).toBe(MISSING_CLIENT_CAPABILITY_CODE);
      expect(disp.data.requiredCapabilities).toEqual({ elicitation: {} });
    } else {
      throw new Error('expected a capability rejection');
    }
  });

  it('accepts when the required capability IS declared', () => {
    const meta = baselineMeta({ 'io.modelcontextprotocol/clientCapabilities': { elicitation: {} } });
    const disp = classifyServerRequest({
      meta,
      serverSupportedRevisions: SUPPORTED,
      requiredClientCapabilities: { elicitation: {} },
    });
    expect(disp.ok).toBe(true);
  });
});

describe('AC-45.10 — omitted §4-required field rejected with -32602', () => {
  it('rejects with -32602 when a required field is omitted (R-29.2-j)', () => {
    const meta = baselineMeta();
    delete meta['io.modelcontextprotocol/clientInfo'];
    const disp = classifyServerRequest({ meta, serverSupportedRevisions: SUPPORTED });
    expect(disp.ok).toBe(false);
    if (!disp.ok && disp.stage === 'envelope') {
      expect(disp.code).toBe(INVALID_PARAMS_CODE);
    } else {
      throw new Error('expected an envelope rejection');
    }
  });
});

describe('AC-45.11 — resultType present and drawn from the advertised set', () => {
  it('accepts a core resultType (R-29.2-k, R-29.2-l)', () => {
    expect(validateSuccessResultType({ resultType: RESULT_TYPE.COMPLETE })).toEqual({
      ok: true,
      resultType: 'complete',
    });
    expect(validateSuccessResultType({ resultType: RESULT_TYPE.INPUT_REQUIRED }).ok).toBe(true);
  });

  it('rejects a missing discriminator', () => {
    const v = validateSuccessResultType({ content: [] });
    expect(v).toEqual({ ok: false, reason: 'missing' });
  });

  it('rejects a value contributed only by a NON-advertised extension, accepts when advertised', () => {
    const contributions = new Map([['com.example/ext', ['streamed']]]);
    // not in the active set → not advertised
    expect(validateSuccessResultType({ resultType: 'streamed' }, [], contributions)).toEqual({
      ok: false,
      reason: 'not-advertised',
      resultType: 'streamed',
    });
    // in the active set → accepted
    expect(validateSuccessResultType({ resultType: 'streamed' }, ['com.example/ext'], contributions).ok).toBe(true);
  });
});

describe('AC-45.12 — unadvertised feature is gated/refused', () => {
  it('refuses an unadvertised feature (R-29.2-m, R-29.2-n)', () => {
    const disp = classifyServerRequest({
      meta: baselineMeta(),
      serverSupportedRevisions: SUPPORTED,
      featureAdvertised: false,
    });
    expect(disp.ok).toBe(false);
    if (!disp.ok && disp.stage === 'gating') {
      expect(disp.reason).toBe('not-advertised');
    } else {
      throw new Error('expected a gating refusal');
    }
  });

  it('allows an advertised feature', () => {
    expect(
      classifyServerRequest({ meta: baselineMeta(), serverSupportedRevisions: SUPPORTED, featureAdvertised: true }).ok,
    ).toBe(true);
  });
});

describe('AC-45.13 — client request carries revision, identity, capabilities', () => {
  it('all three required keys present → conformant (R-29.3-a)', () => {
    expect(clientRequestCarriesBaselineEnvelope(baselineMeta())).toBe(true);
  });

  it('any missing required key → non-conformant', () => {
    for (const key of REQUIRED_CLIENT_REQUEST_META_KEYS) {
      const meta = baselineMeta();
      delete meta[key];
      expect(clientRequestCarriesBaselineEnvelope(meta)).toBe(false);
    }
  });
});

describe('AC-45.14 — revision selection & -32004 retry', () => {
  it('R-29.3-b is MUST and R-29.3-c is SHOULD', () => {
    expect(lookupRequirement('R-29.3-b')?.keyword).toBe('MUST');
    expect(lookupRequirement('R-29.3-c')?.keyword).toBe('SHOULD');
  });
});

describe('AC-45.15 — opacity handling', () => {
  it('the opacity atoms exist with the right levels (R-29.3-d, R-29.3-e, R-29.3-f)', () => {
    expect(lookupRequirement('R-29.3-d')?.keyword).toBe('MUST');
    expect(lookupRequirement('R-29.3-e')?.keyword).toBe('MUST NOT');
    expect(lookupRequirement('R-29.3-f')?.keyword).toBe('MUST');
  });
});

describe('AC-45.16 / AC-45.17 — input_required fulfillment and retry shape', () => {
  it('R-29.3-g/h are MUST and R-29.3-i is MAY', () => {
    expect(lookupRequirement('R-29.3-g')?.keyword).toBe('MUST');
    expect(lookupRequirement('R-29.3-h')?.keyword).toBe('MUST');
    expect(lookupRequirement('R-29.3-i')?.keyword).toBe('MAY');
  });

  it('retry uses a distinct id and echoes requestState exactly when provided (R-29.3-j)', () => {
    expect(
      validateInputRequiredRetry({ originalId: 'req-3', retryId: 'req-3-retry', providedState: 'OPAQUE', retryState: 'OPAQUE' }),
    ).toEqual({ ok: true });
  });

  it('reusing the original id is rejected', () => {
    expect(validateInputRequiredRetry({ originalId: 7, retryId: 7 })).toEqual({ ok: false, reason: 'reused-id' });
  });

  it('a changed requestState is rejected (must echo byte-for-byte)', () => {
    expect(
      validateInputRequiredRetry({ originalId: 'a', retryId: 'b', providedState: 'X', retryState: 'Y' }),
    ).toEqual({ ok: false, reason: 'state-mismatch' });
  });

  it('including a requestState when none was provided is rejected; omitting it is ok', () => {
    expect(validateInputRequiredRetry({ originalId: 'a', retryId: 'b', retryState: 'X' })).toEqual({
      ok: false,
      reason: 'unexpected-state',
    });
    expect(validateInputRequiredRetry({ originalId: 'a', retryId: 'b' })).toEqual({ ok: true });
  });
});

describe('AC-45.18 — client routes by resultType with robustness', () => {
  it('R-29.3-k is MUST', () => {
    expect(lookupRequirement('R-29.3-k')?.keyword).toBe('MUST');
  });

  it('a core resultType is acted upon', () => {
    expect(decideResultAction({ resultType: 'complete' })).toEqual({ act: true, resultType: 'complete' });
  });
});

describe('AC-45.19 / AC-45.21 — capability-conditioned obligations', () => {
  it('every per-capability obligation maps to its feature section (R-29.4-a..g)', () => {
    expect(obligationForCapability('tools')?.section).toBe('16');
    expect(obligationForCapability('resources')?.section).toBe('17');
    expect(obligationForCapability('prompts')?.section).toBe('18');
    expect(obligationForCapability('completions')?.section).toBe('19');
    expect(obligationForCapability('elicitation')?.section).toBe('20');
  });

  it('resource subscriptions additionally bind §10 (R-29.4-c)', () => {
    const obligation = obligationForCapability('resources.subscribe');
    expect(obligation?.section).toBe('17');
    expect(obligation?.additionalSections).toContain('10');
  });

  it('obligedSectionsForCapabilities aggregates and de-duplicates', () => {
    expect(obligedSectionsForCapabilities(['tools', 'resources.subscribe', 'completions'])).toEqual([
      '10',
      '16',
      '17',
      '19',
    ]);
  });

  it('elicitation is a CLIENT obligation', () => {
    expect(obligationForCapability('elicitation')?.party).toBe('client');
    expect(CAPABILITY_OBLIGATIONS.find((o) => o.capability === 'tools')?.party).toBe('server');
  });

  it('advertising binds full MUST-level conformance: R-29.4-a and R-29.4-j (R-29.4-j is MUST NOT)', () => {
    expect(lookupRequirement('R-29.4-a')?.keyword).toBe('MUST');
    expect(lookupRequirement('R-29.4-j')?.keyword).toBe('MUST NOT');
  });

  it('requirementsForProfile includes a capability atom only when the capability is advertised', () => {
    const withTools: ConformanceProfile = {
      roles: ['server'],
      revisions: SUPPORTED,
      capabilities: ['tools'],
      extensions: [],
      transports: ['stdio'],
    };
    const without: ConformanceProfile = { ...withTools, capabilities: [] };
    expect(requirementsForProfile(withTools).map((r) => r.id)).toContain('R-29.4-b');
    expect(requirementsForProfile(without).map((r) => r.id)).not.toContain('R-29.4-b');
  });
});

describe('AC-45.20 — never depend on an unadvertised feature', () => {
  it('R-29.4-h and R-29.4-i are MUST NOT', () => {
    expect(lookupRequirement('R-29.4-h')?.keyword).toBe('MUST NOT');
    expect(lookupRequirement('R-29.4-i')?.keyword).toBe('MUST NOT');
  });
});

describe('AC-45.22 — no unsolicited input request of an undeclared kind', () => {
  it('a server may not place an elicitation input request unless the client declared elicitation (R-29.4-l)', () => {
    expect(mayPlaceInputRequest('elicitation/create', {})).toBe(false);
    expect(mayPlaceInputRequest('elicitation/create', { elicitation: {} })).toBe(true);
  });

  it('the gating capability map covers the three recognized kinds', () => {
    expect(INPUT_REQUEST_REQUIRED_CAPABILITY['elicitation/create']).toBe('elicitation');
    expect(INPUT_REQUEST_REQUIRED_CAPABILITY['roots/list']).toBe('roots');
    expect(INPUT_REQUEST_REQUIRED_CAPABILITY['sampling/createMessage']).toBe('sampling');
  });

  it('an unrecognized input-request kind is never placeable', () => {
    expect(mayPlaceInputRequest('unknown/kind', { unknown: {} })).toBe(false);
  });
});

describe('AC-45.23 — deprecated client-provided capabilities are bidirectional', () => {
  it('R-29.4-m is MUST, R-29.4-n is MUST NOT', () => {
    expect(lookupRequirement('R-29.4-m')?.keyword).toBe('MUST');
    expect(lookupRequirement('R-29.4-n')?.keyword).toBe('MUST NOT');
  });
});

describe('AC-45.24 / AC-45.25 / AC-45.26 — optionality of extensions and deprecated features', () => {
  it('zero extensions is fully conformant (R-29.5-a is OPTIONAL)', () => {
    expect(lookupRequirement('R-29.5-a')?.keyword).toBe('OPTIONAL');
    const profile: ConformanceProfile = {
      roles: ['server'],
      revisions: SUPPORTED,
      capabilities: [],
      extensions: [],
      transports: ['stdio'],
    };
    expect(validateConformanceProfile(profile)).toEqual({ ok: true });
  });

  it('an advertised extension MUST be well-formed (R-29.5-c) and implement its behaviors (R-29.5-b, R-29.5-d)', () => {
    expect(lookupRequirement('R-29.5-b')?.keyword).toBe('MUST');
    expect(lookupRequirement('R-29.5-c')?.keyword).toBe('MUST');
    expect(lookupRequirement('R-29.5-d')?.keyword).toBe('MUST');
    const bad: ConformanceProfile = {
      roles: ['server'],
      revisions: SUPPORTED,
      capabilities: [],
      extensions: ['not a valid id'],
      transports: ['stdio'],
    };
    const v = validateConformanceProfile(bad);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.violations.some((x) => x.field === 'extensions')).toBe(true);
  });

  it('deprecated features are optional (R-29.5-e) but full when implemented (R-29.5-f)', () => {
    expect(lookupRequirement('R-29.5-e')?.keyword).toBe('OPTIONAL');
    expect(lookupRequirement('R-29.5-f')?.keyword).toBe('MUST');
    // No partial state: advertised-but-not-fully-implemented is non-conformant.
    expect(isFeatureFullyConformant(true, false)).toEqual({ ok: false, reason: 'advertised-not-implemented' });
    expect(isFeatureFullyConformant(true, true)).toEqual({ ok: true });
    expect(isFeatureFullyConformant(false, false)).toEqual({ ok: true });
  });
});

describe('AC-45.27 — robustness: ignore the unrecognized', () => {
  it('unknown field/capability/extension are ignored, not rejected (R-29.6-a..d)', () => {
    expect(robustnessDisposition('field', false)).toBe('ignore');
    expect(robustnessDisposition('capability', false)).toBe('ignore');
    expect(robustnessDisposition('extension', false)).toBe('ignore');
  });

  it('a recognized element is accepted (never discarded)', () => {
    expect(robustnessDisposition('field', true)).toBe('accept');
    expect(robustnessDisposition('capability', true)).toBe('accept');
  });
});

describe('AC-45.28 — unknown error code is a request failure', () => {
  it('an unknown error code is a failed request, not a crash/misclassification (R-29.6-e)', () => {
    expect(robustnessDisposition('error-code', false)).toBe('fail-request');
    expect(lookupRequirement('R-29.6-e')?.keyword).toBe('MUST');
  });
});

describe('AC-45.29 — unrecognized / absent resultType handling', () => {
  it('an unrecognized resultType is treated as an error and not acted upon (R-29.6-f, R-29.6-g)', () => {
    expect(robustnessDisposition('result-type', false)).toBe('treat-as-error');
    expect(decideResultAction({ resultType: 'wibble' })).toEqual({
      act: false,
      reason: 'unrecognized',
      resultType: 'wibble',
    });
  });

  it('an absent discriminator applies the §3 absence rule → complete (R-29.6-h)', () => {
    expect(decideResultAction({ content: [] })).toEqual({ act: true, resultType: 'complete' });
  });

  it('a value contributed by an active extension is acted upon', () => {
    const contributions = new Map([['com.example/ext', ['streamed']]]);
    expect(decideResultAction({ resultType: 'streamed' }, ['com.example/ext'], contributions)).toEqual({
      act: true,
      resultType: 'streamed',
    });
  });
});

describe('AC-45.30 — robustness never discards understood content', () => {
  it('R-29.6-i is MUST NOT and a recognized element is always accepted', () => {
    expect(lookupRequirement('R-29.6-i')?.keyword).toBe('MUST NOT');
    // recognized content is accepted even alongside ignored unknowns
    expect(robustnessDisposition('field', true)).toBe('accept');
  });
});

describe('AC-45.31 / AC-45.32 — stateless invariants', () => {
  it('each request is processed independently; cross-request state is explicit (R-29.7-a, R-29.7-b)', () => {
    expect(STATELESS_CONFORMANCE_INVARIANTS.independentRequests).toBe(true);
    expect(STATELESS_CONFORMANCE_INVARIANTS.explicitCrossRequestState).toBe(true);
    expect(lookupRequirement('R-29.7-a')?.keyword).toBe('MUST');
    expect(lookupRequirement('R-29.7-b')?.keyword).toBe('MUST');
  });

  it('the connection/process is not the lifetime boundary (R-29.7-c is MUST NOT)', () => {
    expect(STATELESS_CONFORMANCE_INVARIANTS.connectionIsNotLifetimeBoundary).toBe(true);
    expect(lookupRequirement('R-29.7-c')?.keyword).toBe('MUST NOT');
  });
});

describe('AC-45.33 — requestState integrity protection', () => {
  it('requestState is always untrusted; a tampered security-significant value is rejected (R-29.7-d, R-29.7-e)', () => {
    expect(decideRequestStateHandling(true, false)).toEqual({ trust: 'untrusted', action: 'reject' });
    expect(decideRequestStateHandling(true, true)).toEqual({ trust: 'untrusted', action: 'accept' });
    // not security-significant → still untrusted, but accepted regardless of verification
    expect(decideRequestStateHandling(false, false)).toEqual({ trust: 'untrusted', action: 'accept' });
    expect(STATELESS_CONFORMANCE_INVARIANTS.requestStateIsUntrusted).toBe(true);
    expect(STATELESS_CONFORMANCE_INVARIANTS.requestStateIntegrityProtected).toBe(true);
  });
});

describe('AC-45.34 / AC-45.35 — transport conformance & error mapping', () => {
  it('at least one transport and per-transport requirements (R-29.8-a, R-29.8-b)', () => {
    expect(lookupRequirement('R-29.8-a')?.keyword).toBe('MUST');
    expect(lookupRequirement('R-29.8-b')?.keyword).toBe('MUST');
    const noTransport: ConformanceProfile = {
      roles: ['server'],
      revisions: SUPPORTED,
      capabilities: [],
      extensions: [],
      transports: [],
    };
    const v = validateConformanceProfile(noTransport);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.violations.some((x) => x.field === 'transports')).toBe(true);
  });

  it('on Streamable HTTP, -32602 and -32003 map to the prescribed status (R-29.8-c)', () => {
    expect(streamableHttpStatusForProtocolError(INVALID_PARAMS_CODE)).toBe(STREAMABLE_HTTP_NEGOTIATION_ERROR_STATUS);
    expect(streamableHttpStatusForProtocolError(MISSING_CLIENT_CAPABILITY_CODE)).toBe(400);
    // an unrelated code is not pinned here
    expect(streamableHttpStatusForProtocolError(-32601)).toBeUndefined();
  });
});

describe('AC-45.36 / AC-45.37 — authorization applicability & transport independence', () => {
  it('an HTTP transport conforms to authorization; stdio does not apply it (R-29.8-d, R-29.8-e)', () => {
    const http = evaluateTransportConformance('streamable-http');
    expect(http.authorizationApplies).toBe(true);
    expect(http.authorizationForbidden).toBe(false);
    expect(http.credentialConveyance).toBe('bearer');

    const stdio = evaluateTransportConformance('stdio');
    expect(stdio.authorizationApplies).toBe(false);
    expect(stdio.authorizationForbidden).toBe(true);
    expect(stdio.credentialConveyance).toBe('environment');

    expect(lookupRequirement('R-29.8-d')?.keyword).toBe('SHOULD');
    expect(lookupRequirement('R-29.8-e')?.keyword).toBe('SHOULD NOT');
  });

  it('transport independence is MUST NOT and concurrency is MAY (R-29.8-f, R-29.8-g)', () => {
    expect(lookupRequirement('R-29.8-f')?.keyword).toBe('MUST NOT');
    expect(lookupRequirement('R-29.8-g')?.keyword).toBe('MAY');
    // each transport is evaluated independently — no cross-contingency
    const a = evaluateTransportConformance('stdio');
    const b = evaluateTransportConformance('streamable-http');
    expect(a.transport).toBe('stdio');
    expect(b.transport).toBe('streamable-http');
  });
});

describe('AC-45.38 — no partial conformance; exact registry values', () => {
  it('no advertised-but-partially-implemented feature (R-29.9-b)', () => {
    expect(lookupRequirement('R-29.9-b')?.keyword).toBe('MUST');
    expect(isFeatureFullyConformant(true, false).ok).toBe(false);
  });

  it('exact Appendix B/C/D values are required (R-29.9-c)', () => {
    expect(lookupRequirement('R-29.9-c')?.keyword).toBe('MUST');
  });

  it('a profile must include the wire revision and supports it', () => {
    const profile: ConformanceProfile = {
      roles: ['server'],
      revisions: SUPPORTED,
      capabilities: [],
      extensions: [],
      transports: ['stdio'],
    };
    expect(validateConformanceProfile(profile)).toEqual({ ok: true });
    expect(profileSupportsRevision(profile, CURRENT_PROTOCOL_VERSION)).toBe(true);

    const missingWire: ConformanceProfile = { ...profile, revisions: ['2025-01-01'] };
    const v = validateConformanceProfile(missingWire);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.violations.some((x) => x.field === 'revisions')).toBe(true);
  });
});

describe('AC-45.39 — §30 citations are provenance-only', () => {
  it('no citation marker is load-bearing; stripping one changes no behavior (R-30-a)', () => {
    expect(CITATION_STATUS.loadBearing).toBe(false);
    expect(CITATION_STATUS.selfContained).toBe(true);
    expect(isCitationLoadBearing('[MCP-Versioning]')).toBe(false);
    expect(isCitationLoadBearing('[RFC8174]')).toBe(false);
    expect(isCitationLoadBearing('anything-at-all')).toBe(false);
    expect(lookupRequirement('R-30-a')?.keyword).toBe('MAY');
  });
});
