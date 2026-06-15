/**
 * Tests for S44 — Security Considerations (§28).
 *
 * §28 is a consolidating section: it defines no new wire types but binds together
 * the cross-cutting security obligations. These tests exercise the registry, the
 * consent gate, the trust-classification and tool-safety predicates, token
 * handling, continuation-token integrity/replay, elicitation/sampling/UI consent,
 * metadata/observability, and input validation & resource bounds — one or more
 * `it` blocks per AC.
 *
 * AC coverage:
 *  AC-44.1  (R-28-a, R-28.1-a)                      — registry + four-principle baseline
 *  AC-44.2  (R-28.1-b..d, R-28.2-a/b)              — informed consent, review interface
 *  AC-44.3  (R-28.1-e, R-28.1-f)                    — no exposure without consent
 *  AC-44.4  (R-28.1-g, R-28.4-c)                    — access controls by sensitivity
 *  AC-44.5  (R-28.1-h/j/k, R-28.3-a)                — tools as arbitrary code; consent
 *  AC-44.6  (R-28.1-i, R-28.3-b/c)                  — untrusted definitions/annotations
 *  AC-44.7  (R-28.2-c..g)                           — no silence/escalation; fresh consent
 *  AC-44.8  (R-28.3-d/e/f)                          — human in the loop; not model-alone
 *  AC-44.9  (R-28.3-g/h/i)                          — rate-limit + sanitize outputs
 *  AC-44.10 (R-28.3-j/k/l)                          — show args; timeout; audit log (no secrets)
 *  AC-44.11 (R-28.4-a/b/d/e/f)                      — host-elected context; isolation
 *  AC-44.12 (R-28.5-a..e)                           — audience-bound token validation
 *  AC-44.13 (R-28.5-f/g)                            — no token passthrough
 *  AC-44.14 (R-28.5-h/i)                            — exact issuer validation
 *  AC-44.15 (R-28.5-j/k)                            — PKCE S256 (delegated; referenced)
 *  AC-44.16 (R-28.5-l/m)                            — state CSRF (delegated; referenced)
 *  AC-44.17 (R-28.5-n..q, R-28.9-d)                 — token confidentiality/HTTPS
 *  AC-44.18 (R-28.6-a/b/c)                          — continuation-token integrity/replay
 *  AC-44.19 (R-28.7-a..e)                           — elicitation under user control
 *  AC-44.20 (R-28.7-f/g)                            — sampling human review; context bound
 *  AC-44.21 (R-28.8-a..d)                           — UI sandbox + mediated tools/call
 *  AC-44.22 (R-28.8-e..h)                           — no exposure/exfiltration; least privilege
 *  AC-44.23 (R-28.9-a/b/c/e)                        — metadata no-authority; redact
 *  AC-44.24 (R-28.10-a..e)                          — validate args/results; report errors
 *  AC-44.25 (R-28.10-f/g/h)                         — URI validation; SSRF
 *  AC-44.26 (R-28.10-i)                             — Origin validation
 *  AC-44.27 (R-28.10-j)                             — cursor validation
 *  AC-44.28 (R-28.10-k/l)                           — bounded consumption
 *  AC-44.29 (R-28.10-m/n)                           — no external dereferencing
 *  AC-44.30 (R-28.10-o/p)                           — file-path sanitization
 */

import { describe, it, expect } from 'vitest';
import {
  SECURITY_PRINCIPLES,
  SECURITY_REQUIREMENTS,
  lookupSecurityRequirement,
  securityRequirementsForPrinciple,
  mandatorySecurityRequirements,
  assessSecurityBaseline,
  evaluateConsent,
  recordConsentGrant,
  type ConsentGrant,
  classifyToolDefinitionTrust,
  toolAnnotationIsSecurityGuarantee,
  mayDisplayToolAnnotations,
  assertHumanInTheLoop,
  ToolCallRateLimiter,
  buildRateLimitRejection,
  RATE_LIMIT_REJECTION_CODE,
  sanitizeToolOutputText,
  toolOutputHasControlSequences,
  assertServerIsolation,
  assertConsentedDataExposure,
  accessControlsAreCommensurate,
  validateServerAccessToken,
  assertNoTokenPassthrough,
  validateAuthorizationIssuer,
  assertTokenTransportSecurity,
  ContinuationTokenStore,
  assertElicitationUnderUserControl,
  assertSamplingUnderUserControl,
  assertUiSandboxConforming,
  mediateUiInitiatedToolCall,
  metadataConveysAuthority,
  redactForLogging,
  REDACTED_PLACEHOLDER,
  sanitizeConsumedMetadata,
  validatePeerToolCall,
  VALIDATION_ERROR_CODE,
  validateResourceUriAccess,
  validateRequestOrigin,
  validatePaginationCursor,
  enforceInputBounds,
  DEFAULT_INPUT_BOUNDS,
  assertSelfContainedSchema,
  sanitizeFilePath,
  INVALID_CURSOR_CODE,
} from '../../protocol/security.js';
import type { SamplingConsentObligations } from '../../protocol/sampling.js';

const OBJECT_SCHEMA = { type: 'object', properties: {} } as const;

function fullySatisfiedSamplingObligations(): SamplingConsentObligations {
  return {
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
}

describe('AC-44.1 — security baseline registry + four core principles', () => {
  it('exposes the four core principles', () => {
    expect(SECURITY_PRINCIPLES).toEqual([
      'user-consent-and-control',
      'data-privacy',
      'tool-safety',
      'host-mediated-trust',
    ]);
  });

  it('registers every §28 atom and indexes by id (R-28-a)', () => {
    expect(SECURITY_REQUIREMENTS.length).toBeGreaterThan(70);
    const ids = new Set(SECURITY_REQUIREMENTS.map((r) => r.id));
    expect(ids.size).toBe(SECURITY_REQUIREMENTS.length); // no duplicate atoms
    for (const id of ['R-28-a', 'R-28.1-a', 'R-28.5-b', 'R-28.10-p']) {
      expect(ids.has(id)).toBe(true);
    }
    const found = lookupSecurityRequirement('R-28.5-b');
    expect(found?.level).toBe('MUST');
    expect(found?.section).toBe('§28.5');
    expect(lookupSecurityRequirement('R-99-z')).toBeUndefined();
  });

  it('every requirement maps to one of the four principles', () => {
    const principles = new Set<string>(SECURITY_PRINCIPLES);
    for (const req of SECURITY_REQUIREMENTS) {
      expect(principles.has(req.principle)).toBe(true);
    }
    expect(securityRequirementsForPrinciple('tool-safety').length).toBeGreaterThan(0);
  });

  it('mandatory requirements are only MUST / MUST NOT', () => {
    for (const req of mandatorySecurityRequirements()) {
      expect(req.level === 'MUST' || req.level === 'MUST NOT').toBe(true);
    }
  });

  it('assessSecurityBaseline passes only when all four principles are claimed (R-28.1-a)', () => {
    expect(
      assessSecurityBaseline({
        userConsentAndControl: true,
        dataPrivacy: true,
        toolSafety: true,
        hostMediatedTrust: true,
      }),
    ).toEqual({ ok: true });

    const partial = assessSecurityBaseline({
      userConsentAndControl: true,
      dataPrivacy: false,
      toolSafety: true,
      hostMediatedTrust: false,
    });
    expect(partial.ok).toBe(false);
    if (!partial.ok) {
      expect(partial.unmetPrinciples).toEqual(['data-privacy', 'host-mediated-trust']);
    }
  });
});

describe('AC-44.2 / AC-44.7 — informed consent, fresh consent, no silence/escalation', () => {
  it('denies when no prior grant and no explicit approval — silence is not consent (R-28.2-d)', () => {
    const d = evaluateConsent({ operation: 'tool:send_email', scope: 'to=alice' });
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.reason).toBe('no-consent');
  });

  it('allows a freshly informed approval and records a reusable grant (R-28.2-b)', () => {
    const req = { operation: 'tool:send_email', scope: 'to=alice', userApproved: true as const };
    const d = evaluateConsent(req);
    expect(d.allowed).toBe(true);
    const grant = recordConsentGrant(req);
    expect(grant).toEqual({ operation: 'tool:send_email', scope: 'to=alice', informed: true });
    // The recorded grant matches an identical later operation without re-prompting.
    const again = evaluateConsent({ operation: 'tool:send_email', scope: 'to=alice' }, grant);
    expect(again.allowed).toBe(true);
    if (again.allowed) expect(again.reason).toBe('matches-prior-grant');
  });

  it('requires fresh consent on material change and refuses silent escalation (R-28.2-e/f)', () => {
    const prior: ConsentGrant = { operation: 'tool:send_email', scope: 'to=alice', informed: true };
    // Same operation, materially different scope, no fresh approval.
    const d = evaluateConsent({ operation: 'tool:send_email', scope: 'to=attacker' }, prior);
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.reason).toBe('silent-escalation');
    // With fresh approval, the escalated scope is allowed.
    const approved = evaluateConsent(
      { operation: 'tool:send_email', scope: 'to=attacker', userApproved: true },
      prior,
    );
    expect(approved.allowed).toBe(true);
  });

  it('never treats a missing userApproved flag as approval (R-28.2-d)', () => {
    const d = evaluateConsent({ operation: 'op', scope: 's', userApproved: undefined });
    expect(d.allowed).toBe(false);
  });
});

describe('AC-44.3 — no data exposure without consent', () => {
  it('blocks exposing user data without a matching consent grant (R-28.1-e/f, R-28.4-b)', () => {
    const blocked = assertConsentedDataExposure({ scope: 'file:///secret.txt' });
    expect(blocked.ok).toBe(false);

    const grant: ConsentGrant = { operation: 'resource-exposure', scope: 'file:///secret.txt', informed: true };
    const allowed = assertConsentedDataExposure({ scope: 'file:///secret.txt', priorGrant: grant });
    expect(allowed.ok).toBe(true);
  });
});

describe('AC-44.4 — access controls commensurate with sensitivity', () => {
  it('passes only when controls are at least as strong as the data sensitivity (R-28.1-g, R-28.4-c)', () => {
    expect(accessControlsAreCommensurate('confidential', 'confidential')).toBe(true);
    expect(accessControlsAreCommensurate('confidential', 'secret')).toBe(true);
    expect(accessControlsAreCommensurate('secret', 'confidential')).toBe(false);
    expect(accessControlsAreCommensurate('public', 'public')).toBe(true);
  });
});

describe('AC-44.5 / AC-44.6 — tools as arbitrary code; untrusted definitions/annotations', () => {
  it('classifies a tool definition as untrusted unless from a trusted server (R-28.1-i, R-28.3-b)', () => {
    expect(classifyToolDefinitionTrust(false)).toBe('untrusted');
    expect(classifyToolDefinitionTrust(true)).toBe('trusted');
  });

  it('never treats an annotation as a security guarantee (R-28.3-c)', () => {
    expect(toolAnnotationIsSecurityGuarantee({ readOnlyHint: true })).toBe(false);
    expect(toolAnnotationIsSecurityGuarantee(undefined)).toBe(false);
  });

  it('MAY display annotations from a trusted server but not from an untrusted one (R-28.3-b)', () => {
    expect(mayDisplayToolAnnotations(true)).toBe(true);
    expect(mayDisplayToolAnnotations(false)).toBe(false);
  });
});

describe('AC-44.8 — human in the loop; decision not model-alone', () => {
  it('rejects a model-alone invocation (R-28.3-e)', () => {
    const r = assertHumanInTheLoop({ userCouldReviewAndDeny: true, modelDecidedAlone: true });
    expect(r.ok).toBe(false);
  });

  it('rejects when the user could not review/deny (R-28.3-d)', () => {
    const r = assertHumanInTheLoop({ userCouldReviewAndDeny: false, modelDecidedAlone: false });
    expect(r.ok).toBe(false);
  });

  it('accepts a human-gated, reviewable invocation', () => {
    const r = assertHumanInTheLoop({ userCouldReviewAndDeny: true, modelDecidedAlone: false });
    expect(r.ok).toBe(true);
  });
});

describe('AC-44.9 — tools/call rate limiting + output sanitization', () => {
  it('rejects calls exceeding the limit rather than executing them (R-28.3-g/h)', () => {
    let t = 0;
    const limiter = new ToolCallRateLimiter({ maxInWindow: 2, windowMs: 1000, now: () => t });
    expect(limiter.check('client-a').allowed).toBe(true);
    expect(limiter.check('client-a').allowed).toBe(true);
    const third = limiter.check('client-a');
    expect(third.allowed).toBe(false);
    if (!third.allowed) expect(third.retryAfterMs).toBeGreaterThan(0);
    // A different client has its own independent window.
    expect(limiter.check('client-b').allowed).toBe(true);
    // After the window elapses, the first client is allowed again.
    t = 1001;
    expect(limiter.check('client-a').allowed).toBe(true);
  });

  it('builds the -32600 rate-limit rejection matching the wire example (R-28.3-h)', () => {
    const err = buildRateLimitRejection(1000);
    expect(err.code).toBe(RATE_LIMIT_REJECTION_CODE);
    expect(err.code).toBe(-32600);
    expect(err.data).toEqual({ retryAfterMs: 1000 });
    expect(buildRateLimitRejection().data).toBeUndefined();
  });

  it('rejects invalid limiter configuration', () => {
    expect(() => new ToolCallRateLimiter({ maxInWindow: 0, windowMs: 1000 })).toThrow(RangeError);
    expect(() => new ToolCallRateLimiter({ maxInWindow: 1, windowMs: 0 })).toThrow(RangeError);
  });

  it('sanitizes control sequences from tool output but keeps ordinary whitespace (R-28.3-i)', () => {
    const malicious = 'ok\x1b[31mRED\x07\x00 text\twith\nnewlines';
    expect(toolOutputHasControlSequences(malicious)).toBe(true);
    const clean = sanitizeToolOutputText(malicious);
    expect(clean).toBe('ok[31mRED text\twith\nnewlines');
    expect(toolOutputHasControlSequences(clean)).toBe(false);
    // Idempotent on already-clean text.
    expect(sanitizeToolOutputText('plain text\n')).toBe('plain text\n');
  });
});

describe('AC-44.10 — client-side argument display, timeout, audit logging (no secrets)', () => {
  it('redacts credentials/tokens from audit-log content (R-28.3-l, R-28.9-d)', () => {
    const logged = redactForLogging({
      tool: 'send_email',
      arguments: { to: 'alice', authorization: 'Bearer abc' },
      access_token: 'xyz',
    }) as Record<string, unknown>;
    const args = logged['arguments'] as Record<string, unknown>;
    expect(args['authorization']).toBe(REDACTED_PLACEHOLDER);
    expect(args['to']).toBe('alice');
    expect(logged['access_token']).toBe(REDACTED_PLACEHOLDER);
  });
});

describe('AC-44.11 — host-elected context; server isolation', () => {
  it('rejects relaying one server’s data to another (R-28.4-e/f)', () => {
    const r = assertServerIsolation({
      sourceServerId: 'server-a',
      destinationServerId: 'server-b',
      hostElected: true,
    });
    expect(r.ok).toBe(false);
  });

  it('rejects sharing context the host did not elect (R-28.4-a)', () => {
    const r = assertServerIsolation({ destinationServerId: 'server-b', hostElected: false });
    expect(r.ok).toBe(false);
  });

  it('allows host-elected context delivered to the same server', () => {
    const r = assertServerIsolation({
      sourceServerId: 'server-a',
      destinationServerId: 'server-a',
      hostElected: true,
    });
    expect(r.ok).toBe(true);
  });
});

describe('AC-44.12 — audience-bound token validation before processing', () => {
  it('rejects a token not validated before use (R-28.5-d)', () => {
    const r = validateServerAccessToken({
      tokenAudience: 'https://mcp.example.com',
      ownCanonicalResource: 'https://mcp.example.com',
      validatedBeforeUse: false,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe(-32600);
  });

  it('rejects an audience-mismatched token (R-28.5-b/c/e)', () => {
    const r = validateServerAccessToken({
      tokenAudience: 'https://other.example.com',
      ownCanonicalResource: 'https://mcp.example.com',
      validatedBeforeUse: true,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('not valid for this resource');
  });

  it('accepts an audience-bound, validated token', () => {
    const r = validateServerAccessToken({
      tokenAudience: ['https://mcp.example.com'],
      ownCanonicalResource: 'https://mcp.example.com',
      validatedBeforeUse: true,
    });
    expect(r.ok).toBe(true);
  });
});

describe('AC-44.13 — no token passthrough / confused deputy', () => {
  it('rejects forwarding the client-presented token upstream (R-28.5-f)', () => {
    const r = assertNoTokenPassthrough({
      clientPresentedToken: 'client-token',
      upstreamToken: 'client-token',
      upstreamTokenIssuer: 'https://up.example.com',
      upstreamAuthorizationServerIssuer: 'https://up.example.com',
    });
    expect(r.ok).toBe(false);
  });

  it('rejects an upstream token not issued by the upstream AS (R-28.5-g)', () => {
    const r = assertNoTokenPassthrough({
      clientPresentedToken: 'client-token',
      upstreamToken: 'separate-token',
      upstreamTokenIssuer: 'https://wrong.example.com',
      upstreamAuthorizationServerIssuer: 'https://up.example.com',
    });
    expect(r.ok).toBe(false);
  });

  it('accepts a separate upstream token issued by the upstream AS', () => {
    const r = assertNoTokenPassthrough({
      clientPresentedToken: 'client-token',
      upstreamToken: 'separate-token',
      upstreamTokenIssuer: 'https://up.example.com',
      upstreamAuthorizationServerIssuer: 'https://up.example.com',
    });
    expect(r.ok).toBe(true);
  });
});

describe('AC-44.14 — exact issuer validation (mix-up defense)', () => {
  it('rejects a returned issuer that differs from the recorded one (R-28.5-h/i)', () => {
    const r = validateAuthorizationIssuer({
      iss: 'https://evil.example.com',
      recordedIssuer: 'https://as.example.com',
    });
    expect(r.ok).toBe(false);
  });

  it('accepts an exact issuer match', () => {
    const r = validateAuthorizationIssuer({
      iss: 'https://as.example.com',
      recordedIssuer: 'https://as.example.com',
      issParameterSupported: true,
    });
    expect(r.ok).toBe(true);
  });
});

describe('AC-44.17 — token confidentiality, HTTPS endpoints', () => {
  it('rejects logging or forwarding a token (R-28.5-o/p, R-28.9-d)', () => {
    expect(
      assertTokenTransportSecurity({
        endpointUrls: ['https://as.example.com/token'],
        tokenLogged: true,
        tokenForwarded: false,
      }).ok,
    ).toBe(false);
    expect(
      assertTokenTransportSecurity({
        endpointUrls: ['https://as.example.com/token'],
        tokenLogged: false,
        tokenForwarded: true,
      }).ok,
    ).toBe(false);
  });

  it('requires HTTPS AS endpoints but permits a localhost http redirect (R-28.5-q)', () => {
    expect(
      assertTokenTransportSecurity({
        endpointUrls: ['http://as.example.com/token'],
        tokenLogged: false,
        tokenForwarded: false,
      }).ok,
    ).toBe(false);
    const ok = assertTokenTransportSecurity({
      endpointUrls: ['https://as.example.com/token'],
      redirectUris: ['http://localhost:8080/cb', 'https://app.example.com/cb'],
      tokenLogged: false,
      tokenForwarded: false,
    });
    expect(ok.ok).toBe(true);
    // A non-localhost http redirect is rejected.
    expect(
      assertTokenTransportSecurity({
        endpointUrls: ['https://as.example.com/token'],
        redirectUris: ['http://app.example.com/cb'],
        tokenLogged: false,
        tokenForwarded: false,
      }).ok,
    ).toBe(false);
  });
});

describe('AC-44.18 — continuation-token integrity, replay defense', () => {
  it('protects integrity: a tampered token is rejected, not acted on (R-28.6-a/b)', () => {
    const store = new ContinuationTokenStore<{ step: number }>();
    const issued = store.issue({ step: 1 }, { integrityTag: 'sig-123' });
    // Wrong integrity tag fails.
    const bad = store.validate(issued.value, 'sig-WRONG');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toBe('integrity-failure');
    // Correct tag succeeds and returns the protected state.
    const good = store.validate(issued.value, 'sig-123');
    expect(good.ok).toBe(true);
    if (good.ok) expect(good.state).toEqual({ step: 1 });
  });

  it('rejects an unknown token (R-28.6-b)', () => {
    const store = new ContinuationTokenStore();
    const r = store.validate('never-issued');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('unknown');
  });

  it('guards against replay: single-use and time-bounded (R-28.6-c)', () => {
    let t = 0;
    const store = new ContinuationTokenStore<number>({ now: () => t });
    const issued = store.issue(42, { ttlMs: 100 });
    expect(store.validate(issued.value).ok).toBe(true);
    // Re-use of a single-use token is refused.
    const replay = store.validate(issued.value);
    expect(replay.ok).toBe(false);
    if (!replay.ok) expect(replay.reason).toBe('replayed');
    // A fresh, expired token is refused too.
    const issued2 = store.issue(43, { ttlMs: 100 });
    t = 200;
    const expired = store.validate(issued2.value);
    expect(expired.ok).toBe(false);
    if (!expired.ok) expect(expired.reason).toBe('expired');
  });
});

describe('AC-44.19 — elicitation under user control', () => {
  it('rejects when the user could not review (R-28.7-b)', () => {
    const r = assertElicitationUnderUserControl({
      decision: 'approve',
      userCouldReview: false,
      serverIdentityShown: true,
    });
    expect(r.ok).toBe(false);
  });

  it('always permits decline/cancel without returning anything (R-28.7-c)', () => {
    expect(
      assertElicitationUnderUserControl({
        decision: 'cancel',
        userCouldReview: true,
        serverIdentityShown: false,
      }).ok,
    ).toBe(true);
  });

  it('requires server identity to be shown on approve (R-28.7-e)', () => {
    const r = assertElicitationUnderUserControl({
      decision: 'approve',
      userCouldReview: true,
      serverIdentityShown: false,
    });
    expect(r.ok).toBe(false);
  });

  it('rejects a form schema that phishes for secrets (R-28.7-d)', () => {
    const r = assertElicitationUnderUserControl({
      decision: 'approve',
      userCouldReview: true,
      serverIdentityShown: true,
      requestedSchema: { properties: { password: { type: 'string', title: 'Your password' } } },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('phish');
  });

  it('accepts an approve with non-sensitive fields and shown identity', () => {
    const r = assertElicitationUnderUserControl({
      decision: 'approve',
      userCouldReview: true,
      serverIdentityShown: true,
      requestedSchema: { properties: { city: { type: 'string' } } },
    });
    expect(r.ok).toBe(true);
  });
});

describe('AC-44.20 — sampling human review; bounded context', () => {
  it('rejects when MUST-level sampling obligations are unmet (R-28.7-a)', () => {
    const obligations = fullySatisfiedSamplingObligations();
    obligations.humanInTheLoop = false;
    const r = assertSamplingUnderUserControl({
      obligations,
      promptReviewed: true,
      completionReviewed: true,
      disclosedContextWithinAuthorization: true,
    });
    expect(r.ok).toBe(false);
  });

  it('rejects unreviewed prompt or completion (R-28.7-f)', () => {
    const r = assertSamplingUnderUserControl({
      obligations: fullySatisfiedSamplingObligations(),
      promptReviewed: true,
      completionReviewed: false,
      disclosedContextWithinAuthorization: true,
    });
    expect(r.ok).toBe(false);
  });

  it('rejects disclosing more context than authorized (R-28.7-g)', () => {
    const r = assertSamplingUnderUserControl({
      obligations: fullySatisfiedSamplingObligations(),
      promptReviewed: true,
      completionReviewed: true,
      disclosedContextWithinAuthorization: false,
    });
    expect(r.ok).toBe(false);
  });

  it('accepts a fully reviewed, bounded sampling flow', () => {
    const r = assertSamplingUnderUserControl({
      obligations: fullySatisfiedSamplingObligations(),
      promptReviewed: true,
      completionReviewed: true,
      disclosedContextWithinAuthorization: true,
    });
    expect(r.ok).toBe(true);
  });
});

describe('AC-44.21 / AC-44.22 — UI sandboxing + mediated tools/call', () => {
  it('rejects a missing CSP, incomplete sandbox, or dirty exposure (R-28.8-a/e/f)', () => {
    const denied = ['dom', 'cookies', 'storage', 'navigation'];
    expect(
      assertUiSandboxConforming({
        sandboxDeniedAccess: denied,
        restrictiveCspApplied: false,
        exposedToUi: {},
      }).ok,
    ).toBe(false);
    expect(
      assertUiSandboxConforming({
        sandboxDeniedAccess: ['dom', 'cookies'],
        restrictiveCspApplied: true,
        exposedToUi: {},
      }).ok,
    ).toBe(false);
    expect(
      assertUiSandboxConforming({
        sandboxDeniedAccess: denied,
        restrictiveCspApplied: true,
        exposedToUi: { accessToken: 'secret' },
      }).ok,
    ).toBe(false);
  });

  it('accepts an isolated sandbox with clean exposure', () => {
    const r = assertUiSandboxConforming({
      sandboxDeniedAccess: ['dom', 'cookies', 'storage', 'navigation'],
      restrictiveCspApplied: true,
      exposedToUi: { toolInput: {}, toolResult: {}, hostContext: {} },
    });
    expect(r.ok).toBe(true);
  });

  it('routes a UI tools/call only with app visibility, policy, and consent (R-28.8-b/c/d)', () => {
    const appVisible = { visibility: ['app'] as string[] };
    expect(
      mediateUiInitiatedToolCall({ uiMeta: appVisible, userConsented: true, policyAllows: true }),
    ).toEqual({ route: true });
    // No consent → no route.
    const noConsent = mediateUiInitiatedToolCall({
      uiMeta: appVisible,
      userConsented: false,
      policyAllows: true,
    });
    expect(noConsent.route).toBe(false);
    // Policy denies → no route.
    const noPolicy = mediateUiInitiatedToolCall({
      uiMeta: appVisible,
      userConsented: true,
      policyAllows: false,
    });
    expect(noPolicy.route).toBe(false);
  });
});

describe('AC-44.23 — metadata carries no authority; structure validated; redacted', () => {
  it('never treats metadata as a source of authority (R-28.9-a)', () => {
    expect(metadataConveysAuthority('traceparent')).toBe(false);
    expect(metadataConveysAuthority('progressToken')).toBe(false);
  });

  it('keeps only known metadata keys and drops the rest (R-28.9-b)', () => {
    const sanitized = sanitizeConsumedMetadata(
      { traceparent: '00-abc', injected: 'evil', missing: undefined },
      ['traceparent', 'missing'],
    );
    expect(sanitized).toEqual({ traceparent: '00-abc' });
    expect(sanitizeConsumedMetadata('not-an-object', ['x'])).toEqual({});
  });

  it('redacts nested credentials/tokens before logging (R-28.9-c/d/e)', () => {
    const redacted = redactForLogging({
      meta: { traceparent: '00-abc', cookie: 'session=1' },
      list: [{ token: 't' }, 'plain'],
    }) as Record<string, unknown>;
    const meta = redacted['meta'] as Record<string, unknown>;
    expect(meta['traceparent']).toBe('00-abc');
    expect(meta['cookie']).toBe(REDACTED_PLACEHOLDER);
    const list = redacted['list'] as unknown[];
    expect((list[0] as Record<string, unknown>)['token']).toBe(REDACTED_PLACEHOLDER);
    expect(list[1]).toBe('plain');
  });
});

describe('AC-44.24 — validate tool args/results; report errors not act', () => {
  it('reports invalid arguments as a -32602 error rather than acting (R-28.10-a/c/e)', () => {
    const tool = {
      inputSchema: { type: 'object', properties: { location: { type: 'string' } }, required: ['location'] },
    };
    const r = validatePeerToolCall({ tool, args: { location: 42 } });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe(VALIDATION_ERROR_CODE);
      expect(r.code).toBe(-32602);
      expect(r.errors.length).toBeGreaterThan(0);
    }
  });

  it('validates structured results against the output schema (R-28.10-d)', () => {
    const tool = {
      inputSchema: OBJECT_SCHEMA,
      outputSchema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] },
    };
    const bad = validatePeerToolCall({ tool, args: {}, structuredResult: { ok: 'yes' } });
    expect(bad.ok).toBe(false);
    const good = validatePeerToolCall({ tool, args: {}, structuredResult: { ok: true } });
    expect(good.ok).toBe(true);
  });

  it('accepts valid arguments', () => {
    const tool = { inputSchema: { type: 'object', properties: { location: { type: 'string' } } } };
    expect(validatePeerToolCall({ tool, args: { location: 'SF' } }).ok).toBe(true);
  });
});

describe('AC-44.25 — URI validation; authorized location; SSRF', () => {
  it('rejects a malformed URI before dereferencing (R-28.10-f)', () => {
    const r = validateResourceUriAccess('not a uri', { isAuthorizedLocation: () => true });
    expect(r.ok).toBe(false);
  });

  it('rejects an unauthorized location (R-28.10-g)', () => {
    const r = validateResourceUriAccess('https://example.com/x', { isAuthorizedLocation: () => false });
    expect(r.ok).toBe(false);
  });

  it('guards against SSRF to private/loopback hosts (R-28.10-h)', () => {
    const opts = { isAuthorizedLocation: () => true, guardSsrf: true };
    expect(validateResourceUriAccess('http://127.0.0.1/admin', opts).ok).toBe(false);
    expect(validateResourceUriAccess('http://169.254.169.254/latest', opts).ok).toBe(false);
    expect(validateResourceUriAccess('http://10.0.0.5/x', opts).ok).toBe(false);
    expect(validateResourceUriAccess('http://localhost/x', opts).ok).toBe(false);
    // A public host passes.
    expect(validateResourceUriAccess('https://example.com/x', opts).ok).toBe(true);
  });
});

describe('AC-44.26 — Origin validation (DNS-rebinding defense)', () => {
  it('rejects a present, untrusted Origin and passes an accepted/absent one (R-28.10-i)', () => {
    const accepted = ['https://app.example.com'];
    expect(validateRequestOrigin('https://evil.example.com', accepted)).toEqual({
      accepted: false,
      origin: 'https://evil.example.com',
    });
    expect(validateRequestOrigin('https://app.example.com', accepted)).toEqual({ accepted: true });
    expect(validateRequestOrigin(undefined, accepted)).toEqual({ accepted: true });
  });
});

describe('AC-44.27 — cursor treated as opaque/untrusted', () => {
  it('rejects a malformed/unknown cursor with -32602, never interpreting it (R-28.10-j)', () => {
    const r = validatePaginationCursor('attacker-controlled', { isKnown: () => false });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe(INVALID_CURSOR_CODE);
      expect(r.error.code).toBe(-32602);
    }
  });

  it('accepts a known cursor and the absent first-page cursor', () => {
    expect(validatePaginationCursor('page-2', { isKnown: () => true })).toEqual({ ok: true, cursor: 'page-2' });
    expect(validatePaginationCursor(undefined, { isKnown: () => true })).toEqual({ ok: true, cursor: undefined });
  });
});

describe('AC-44.28 — bounded consumption (schema depth, payload size)', () => {
  it('rejects a schema deeper than the bound (R-28.10-k)', () => {
    let deep: Record<string, unknown> = { type: 'string' };
    for (let i = 0; i < 10; i++) deep = { type: 'object', properties: { nested: deep } };
    const r = enforceInputBounds({ schema: deep, bounds: { maxSchemaDepth: 4, maxPayloadBytes: 1024 } });
    expect(r.ok).toBe(false);
  });

  it('rejects an oversized payload (R-28.10-l)', () => {
    const big = 'x'.repeat(2000);
    const r = enforceInputBounds({ serializedPayload: big, bounds: { maxSchemaDepth: 64, maxPayloadBytes: 1000 } });
    expect(r.ok).toBe(false);
  });

  it('accepts inputs within the default bounds', () => {
    expect(DEFAULT_INPUT_BOUNDS.maxSchemaDepth).toBeGreaterThan(0);
    expect(enforceInputBounds({ schema: OBJECT_SCHEMA, serializedPayload: '{}' }).ok).toBe(true);
  });
});

describe('AC-44.29 — no automatic external dereferencing; self-contained schemas', () => {
  it('rejects a schema with an external $ref (R-28.10-m/n)', () => {
    const schema = { type: 'object', properties: { x: { $ref: 'https://evil.example.com/schema.json' } } };
    const r = assertSelfContainedSchema(schema);
    expect(r.ok).toBe(false);
  });

  it('accepts an in-document $ref', () => {
    const schema = { type: 'object', $defs: { x: { type: 'string' } }, properties: { y: { $ref: '#/$defs/x' } } };
    expect(assertSelfContainedSchema(schema).ok).toBe(true);
  });

  it('permits external refs only when explicitly trusted (R-28.10-n)', () => {
    const schema = { properties: { x: { $ref: 'https://trusted.example.com/s.json' } } };
    expect(assertSelfContainedSchema(schema, { allowTrustedExternalRefs: true }).ok).toBe(true);
  });
});

describe('AC-44.30 — file path sanitization (directory traversal)', () => {
  it('rejects a path that escapes the authorized root via .. (R-28.10-o/p)', () => {
    const r = sanitizeFilePath('../../etc/passwd', '/srv/data');
    expect(r.ok).toBe(false);
  });

  it('rejects an absolute path outside the root (R-28.10-p)', () => {
    const r = sanitizeFilePath('/etc/passwd', '/srv/data');
    expect(r.ok).toBe(false);
  });

  it('accepts a path that stays within the root and normalizes it', () => {
    const r = sanitizeFilePath('sub/./file.txt', '/srv/data');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.resolvedPath).toBe('/srv/data/sub/file.txt');
  });

  it('accepts a traversal that resolves back inside the root', () => {
    const r = sanitizeFilePath('a/../b/file.txt', '/srv/data');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.resolvedPath).toBe('/srv/data/b/file.txt');
  });

  it('rejects a NUL byte in the path (R-28.10-o)', () => {
    const r = sanitizeFilePath('file\x00.txt', '/srv/data');
    expect(r.ok).toBe(false);
  });
});
