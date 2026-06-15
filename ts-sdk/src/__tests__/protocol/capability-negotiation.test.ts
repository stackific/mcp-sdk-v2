/**
 * Tests for S10 — Capability Negotiation: Client & Server Capabilities (§6.1–§6.4).
 *
 * AC coverage:
 *  AC-10.1  (R-6-a, R-6.4-c)                  — caps from per-request field / discover only
 *  AC-10.2  (R-6.1-a, R-6.4-a)                — no reliance on undeclared capability
 *  AC-10.3  (R-6.1-b)                         — sub-flags refine within the family
 *  AC-10.4  (R-6.1-c)                         — no inference of one capability from another
 *  AC-10.5  (R-6.1-d)                         — prepared for non-sub-flag family ops
 *  AC-10.6  (R-6.1-e)                         — do not declare unsupported capability
 *  AC-10.7  (R-6.2-a/b/c, R-6.3-a/b/c)        — experimental map; ignore unknown keys
 *  AC-10.8  (R-6.2-d, R-6.2-e)                — elicitation; form implicit baseline
 *  AC-10.9  (R-6.2-f, R-6.2-g)                — url mode only when url present
 *  AC-10.10 (R-6.2-h/i/j)                     — deprecated roots gates roots/list
 *  AC-10.11 (R-6.2-k/l/m)                     — deprecated sampling gates sampling/createMessage
 *  AC-10.12 (R-6.2-n, R-6.2-o)                — sampling.context gates includeContext
 *  AC-10.13 (R-6.2-p, R-6.2-q)                — sampling.tools gates tools/toolChoice
 *  AC-10.14 (R-6.2-r, R-6.2-s)                — client extensions; empty {} valid
 *  AC-10.15 (R-6.3-d, R-6.3-e)                — completions gates completion/complete
 *  AC-10.16 (R-6.3-f/g/h)                     — prompts + listChanged
 *  AC-10.17 (R-6.3-i/j/k/l)                   — resources + subscribe/listChanged
 *  AC-10.18 (R-6.3-m/n/o)                     — tools + listChanged
 *  AC-10.19 (R-6.3-p, R-6.3-q)                — deprecated logging
 *  AC-10.20 (R-6.3-r, R-6.3-s)                — server extensions; empty {} valid
 *  AC-10.21 (R-6.4-b, R-6.4-d)                — server consults per-request client caps
 *  AC-10.22 (R-6.4-e)                         — input requests governed by originating caps
 *  AC-10.23 (R-6.4-f, R-6.4-g)                — client consults server caps before invoking
 *  AC-10.24 (R-6.4-h, R-6.4-i)                — missing cap → -32003 + HTTP 400
 *  AC-10.25 (R-6.4-j, R-6.4-k)                — malformed _meta → -32602 + HTTP 400
 *  AC-10.26 (R-6.4-l, R-6.4-m)                — graceful degradation
 */

import { describe, it, expect } from 'vitest';
import {
  ClientCapabilitiesSchema,
  ServerCapabilitiesSchema,
  clientDeclares,
  serverDeclares,
  serverMethodRequiredCapability,
  mayClientInvoke,
  notificationRequiredCapability,
  clientShouldExpectNotification,
  computeMissingClientCapabilities,
  gateRequiredClientCapabilities,
  CAPABILITY_ERROR_HTTP_STATUS,
  httpStatusForCapabilityError,
  mayUseUrlElicitation,
  mayUseSamplingTools,
  mayInvokeRootsList,
  mayInvokeSampling,
  mayUseIncludeContext,
  decideDegradation,
  isDeprecatedClientCapability,
  isDeprecatedServerCapability,
  validateRequestMeta,
} from '../../protocol/capability-negotiation.js';

// ─── schema validity ────────────────────────────────────────────────────────────

describe('capability schemas accept empty {} and the spec wire examples', () => {
  it('empty {} is valid for both', () => {
    expect(ClientCapabilitiesSchema.safeParse({}).success).toBe(true);
    expect(ServerCapabilitiesSchema.safeParse({}).success).toBe(true);
  });

  it('parses the §9.1 ClientCapabilities example', () => {
    expect(ClientCapabilitiesSchema.safeParse({
      elicitation: { form: {}, url: {} },
      sampling: { context: {} },
      experimental: { 'com.example/preview': { beta: true } },
    }).success).toBe(true);
  });

  it('parses the §9.2 ServerCapabilities example', () => {
    expect(ServerCapabilitiesSchema.safeParse({
      tools: { listChanged: true },
      resources: { subscribe: true, listChanged: false },
      prompts: {}, completions: {}, logging: {},
    }).success).toBe(true);
  });
});

// ─── AC-10.1 — caps from per-request field only (R-6-a, R-6.4-c) ────────────────

describe('capabilities derived per-request only (AC-10.1)', () => {
  it('clientDeclares reads only the supplied object, never any prior state', () => {
    expect(clientDeclares({ elicitation: {} }, 'elicitation')).toBe(true);
    expect(clientDeclares({}, 'elicitation')).toBe(false); // a different request declaring {} sees nothing
  });
});

// ─── AC-10.2 — no reliance on undeclared capability (R-6.1-a, R-6.4-a) ──────────

describe('no reliance on an undeclared capability (AC-10.2)', () => {
  it('mayClientInvoke is false for a gated method the server did not declare', () => {
    expect(mayClientInvoke('tools/call', {})).toBe(false);
    expect(mayClientInvoke('tools/call', { tools: {} })).toBe(true);
  });
});

// ─── AC-10.3 — sub-flags refine within the family (R-6.1-b) ─────────────────────

describe('sub-flags refine within the capability family (AC-10.3)', () => {
  it('tools.listChanged refines tools without replacing it', () => {
    const caps = { tools: { listChanged: true } };
    expect(serverDeclares(caps, 'tools')).toBe(true);
    expect(serverDeclares(caps, 'tools.listChanged')).toBe(true);
  });

  it('the base capability stands without the sub-flag', () => {
    const caps = { tools: {} };
    expect(serverDeclares(caps, 'tools')).toBe(true);
    expect(serverDeclares(caps, 'tools.listChanged')).toBe(false);
  });
});

// ─── AC-10.4 — no inference between capabilities (R-6.1-c) ───────────────────────

describe('no inference of one capability from another (AC-10.4)', () => {
  it('declaring sampling does not imply elicitation', () => {
    const caps = { sampling: {} };
    expect(clientDeclares(caps, 'sampling')).toBe(true);
    expect(clientDeclares(caps, 'elicitation')).toBe(false);
  });
});

// ─── AC-10.5 — prepared for non-sub-flag family ops (R-6.1-d) ───────────────────

describe('declaring a capability means prepared for its non-sub-flag operations (AC-10.5)', () => {
  it('a server declaring tools is invocable for tools/list and tools/call', () => {
    const caps = { tools: {} };
    expect(mayClientInvoke('tools/list', caps)).toBe(true);
    expect(mayClientInvoke('tools/call', caps)).toBe(true);
  });
});

// ─── AC-10.6 — do not declare unsupported (R-6.1-e) ─────────────────────────────

describe('omission declares non-support (AC-10.6)', () => {
  it('an omitted field is read as not declared', () => {
    expect(clientDeclares({}, 'roots')).toBe(false);
    expect(serverDeclares({}, 'logging')).toBe(false);
  });
});

// ─── AC-10.7 — experimental map; ignore unknown (R-6.2-a/b/c, R-6.3-a/b/c) ──────

describe('experimental map (AC-10.7)', () => {
  it('accepts an experimental map and passes through unknown keys (receiver ignores them)', () => {
    const parsed = ClientCapabilitiesSchema.safeParse({ experimental: { 'x.y/z': { a: 1 } } });
    expect(parsed.success).toBe(true);
    // unknown top-level keys survive passthrough; gating predicates simply ignore them
    expect(clientDeclares({ experimental: {}, 'made.up/cap': {} } as Record<string, unknown>, 'experimental')).toBe(true);
  });
});

// ─── AC-10.8 — elicitation + form implicit baseline (R-6.2-d, R-6.2-e) ──────────

describe('elicitation and the form implicit baseline (AC-10.8)', () => {
  it('elicitation present ⇒ form supported implicitly even when form is absent', () => {
    expect(clientDeclares({ elicitation: {} }, 'elicitation')).toBe(true);
    expect(clientDeclares({ elicitation: {} }, 'elicitation.form')).toBe(true);
  });

  it('explicit form is also supported', () => {
    expect(clientDeclares({ elicitation: { form: {} } }, 'elicitation.form')).toBe(true);
  });

  it('no elicitation ⇒ no form', () => {
    expect(clientDeclares({}, 'elicitation.form')).toBe(false);
  });
});

// ─── AC-10.9 — url mode only when url present (R-6.2-f, R-6.2-g) ─────────────────

describe('URL-mode elicitation gating (AC-10.9)', () => {
  it('not allowed when url absent (even with elicitation present)', () => {
    expect(mayUseUrlElicitation({ elicitation: {} })).toBe(false);
    expect(mayUseUrlElicitation({ elicitation: { form: {} } })).toBe(false);
  });
  it('allowed only when url sub-flag present', () => {
    expect(mayUseUrlElicitation({ elicitation: { url: {} } })).toBe(true);
  });
});

// ─── AC-10.10 — deprecated roots (R-6.2-h/i/j) ──────────────────────────────────

describe('deprecated roots capability (AC-10.10)', () => {
  it('gates roots/list and is marked deprecated', () => {
    expect(mayInvokeRootsList({ roots: {} })).toBe(true);
    expect(mayInvokeRootsList({})).toBe(false);
    expect(isDeprecatedClientCapability('roots')).toBe(true);
  });
});

// ─── AC-10.11 — deprecated sampling (R-6.2-k/l/m) ───────────────────────────────

describe('deprecated sampling capability (AC-10.11)', () => {
  it('gates sampling/createMessage and is marked deprecated', () => {
    expect(mayInvokeSampling({ sampling: {} })).toBe(true);
    expect(mayInvokeSampling({})).toBe(false);
    expect(isDeprecatedClientCapability('sampling')).toBe(true);
  });
});

// ─── AC-10.12 — sampling.context gates includeContext (R-6.2-n, R-6.2-o) ────────

describe('sampling.context gates includeContext (AC-10.12)', () => {
  it('without context: only none/omit allowed', () => {
    const caps = { sampling: {} };
    expect(mayUseIncludeContext(caps, undefined)).toBe(true);
    expect(mayUseIncludeContext(caps, 'none')).toBe(true);
    expect(mayUseIncludeContext(caps, 'thisServer')).toBe(false);
    expect(mayUseIncludeContext(caps, 'allServers')).toBe(false);
  });
  it('with context: any value allowed', () => {
    const caps = { sampling: { context: {} } };
    expect(mayUseIncludeContext(caps, 'allServers')).toBe(true);
  });
});

// ─── AC-10.13 — sampling.tools gates tools/toolChoice (R-6.2-p, R-6.2-q) ────────

describe('sampling.tools gates sampling tools/toolChoice (AC-10.13)', () => {
  it('not allowed without the sub-flag', () => {
    expect(mayUseSamplingTools({ sampling: {} })).toBe(false);
  });
  it('allowed only with the sub-flag', () => {
    expect(mayUseSamplingTools({ sampling: { tools: {} } })).toBe(true);
  });
});

// ─── AC-10.14 — client extensions; empty valid (R-6.2-r, R-6.2-s) ───────────────

describe('client extensions and empty-object default (AC-10.14)', () => {
  it('extensions is optional and an empty object declares no behaviors', () => {
    expect(ClientCapabilitiesSchema.safeParse({}).success).toBe(true);
    expect(clientDeclares({ extensions: {} }, 'extensions')).toBe(true);
    expect(clientDeclares({}, 'extensions')).toBe(false);
  });
});

// ─── AC-10.15 — completions gates completion/complete (R-6.3-d, R-6.3-e) ────────

describe('completions gates completion/complete (AC-10.15)', () => {
  it('client may not invoke completion/complete unless completions present', () => {
    expect(serverMethodRequiredCapability('completion/complete')).toBe('completions');
    expect(mayClientInvoke('completion/complete', {})).toBe(false);
    expect(mayClientInvoke('completion/complete', { completions: {} })).toBe(true);
  });
});

// ─── AC-10.16 — prompts + listChanged (R-6.3-f/g/h) ─────────────────────────────

describe('prompts capability and listChanged (AC-10.16)', () => {
  it('gates prompts/list and prompts/get', () => {
    expect(mayClientInvoke('prompts/get', { prompts: {} })).toBe(true);
    expect(mayClientInvoke('prompts/list', {})).toBe(false);
  });
  it('listChanged true enables the notification; absent/false ⇒ not expected', () => {
    expect(clientShouldExpectNotification('notifications/prompts/list_changed', { prompts: { listChanged: true } })).toBe(true);
    expect(clientShouldExpectNotification('notifications/prompts/list_changed', { prompts: {} })).toBe(false);
    expect(clientShouldExpectNotification('notifications/prompts/list_changed', { prompts: { listChanged: false } })).toBe(false);
  });
});

// ─── AC-10.17 — resources + subscribe/listChanged (R-6.3-i/j/k/l) ───────────────

describe('resources capability with subscribe and listChanged (AC-10.17)', () => {
  it('gates resource methods', () => {
    expect(mayClientInvoke('resources/read', { resources: {} })).toBe(true);
    expect(mayClientInvoke('resources/list', {})).toBe(false);
  });
  it('subscribe true enables resources/updated; absent/false ⇒ none', () => {
    expect(clientShouldExpectNotification('notifications/resources/updated', { resources: { subscribe: true } })).toBe(true);
    expect(clientShouldExpectNotification('notifications/resources/updated', { resources: {} })).toBe(false);
  });
  it('listChanged true enables resources/list_changed; absent/false ⇒ not expected', () => {
    expect(clientShouldExpectNotification('notifications/resources/list_changed', { resources: { listChanged: true } })).toBe(true);
    expect(clientShouldExpectNotification('notifications/resources/list_changed', { resources: { subscribe: true } })).toBe(false);
  });
});

// ─── AC-10.18 — tools + listChanged (R-6.3-m/n/o) ───────────────────────────────

describe('tools capability and listChanged (AC-10.18)', () => {
  it('gates tools methods and the list_changed notification', () => {
    expect(mayClientInvoke('tools/call', { tools: {} })).toBe(true);
    expect(notificationRequiredCapability('notifications/tools/list_changed')).toBe('tools.listChanged');
    expect(clientShouldExpectNotification('notifications/tools/list_changed', { tools: { listChanged: true } })).toBe(true);
    expect(clientShouldExpectNotification('notifications/tools/list_changed', { tools: {} })).toBe(false);
  });
});

// ─── AC-10.19 — deprecated logging (R-6.3-p, R-6.3-q) ───────────────────────────

describe('deprecated logging capability (AC-10.19)', () => {
  it('gates notifications/message and is marked deprecated', () => {
    expect(clientShouldExpectNotification('notifications/message', { logging: {} })).toBe(true);
    expect(clientShouldExpectNotification('notifications/message', {})).toBe(false);
    expect(isDeprecatedServerCapability('logging')).toBe(true);
  });
});

// ─── AC-10.20 — server extensions; empty valid (R-6.3-r, R-6.3-s) ───────────────

describe('server extensions and empty-object default (AC-10.20)', () => {
  it('extensions optional; empty {} declares no behaviors', () => {
    expect(ServerCapabilitiesSchema.safeParse({ extensions: {} }).success).toBe(true);
    expect(serverDeclares({ extensions: {} }, 'extensions')).toBe(true);
    expect(serverDeclares({}, 'extensions')).toBe(false);
  });
});

// ─── AC-10.21 / AC-10.22 — server consults per-request caps (R-6.4-b/d/e) ───────

describe('server consults the current request capabilities (AC-10.21 · AC-10.22)', () => {
  it('an input request requiring elicitation is gated by the originating request caps', () => {
    // originating request declared elicitation ⇒ server may emit the elicitation input request
    expect(gateRequiredClientCapabilities({ elicitation: {} }, { elicitation: {} }).ok).toBe(true);
    // originating request declared {} ⇒ server must not rely on elicitation
    expect(gateRequiredClientCapabilities({}, { elicitation: {} }).ok).toBe(false);
  });
});

// ─── AC-10.23 — client consults server caps (R-6.4-f, R-6.4-g) ──────────────────

describe('client consults server capabilities before invoking (AC-10.23)', () => {
  it('does not invoke a method whose governing capability is undeclared', () => {
    const serverCaps = { tools: {} }; // from the most recent server/discover result
    expect(mayClientInvoke('tools/call', serverCaps)).toBe(true);
    expect(mayClientInvoke('resources/read', serverCaps)).toBe(false);
  });
});

// ─── AC-10.24 — missing cap → -32003 + 400 (R-6.4-h, R-6.4-i) ───────────────────

describe('missing required client capability → -32003 + HTTP 400 (AC-10.24)', () => {
  it('rejects with -32003 listing required-but-undeclared capabilities', () => {
    const result = gateRequiredClientCapabilities({ sampling: {} }, { elicitation: {} });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(-32003);
      expect(result.error.data.requiredCapabilities).toEqual({ elicitation: {} });
    }
  });

  it('computeMissingClientCapabilities returns only the undeclared subset', () => {
    expect(computeMissingClientCapabilities({ elicitation: {} }, { elicitation: {}, sampling: {} })).toEqual({ sampling: {} });
  });

  it('maps to HTTP 400', () => {
    expect(CAPABILITY_ERROR_HTTP_STATUS).toBe(400);
    expect(httpStatusForCapabilityError(-32003)).toBe(400);
  });
});

// ─── AC-10.25 — malformed _meta → -32602 + 400 (R-6.4-j, R-6.4-k) ───────────────

describe('malformed _meta → -32602 + HTTP 400 (AC-10.25)', () => {
  it('rejects a request omitting a required _meta field with -32602', () => {
    const result = validateRequestMeta({
      'io.modelcontextprotocol/protocolVersion': '2026-07-28',
      'io.modelcontextprotocol/clientInfo': { name: 'c', version: '1' },
      // clientCapabilities omitted
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(-32602);
  });

  it('maps -32602 to HTTP 400', () => {
    expect(httpStatusForCapabilityError(-32602)).toBe(400);
  });
});

// ─── AC-10.26 — graceful degradation (R-6.4-l, R-6.4-m) ─────────────────────────

describe('graceful degradation (AC-10.26)', () => {
  it('proceeds when the peer declares the behavior', () => {
    expect(decideDegradation({ peerDeclaresBehavior: true, behaviorMandatory: true })).toBe('proceed');
  });
  it('falls back to core when an optional behavior is undeclared (never fails for fewer caps)', () => {
    expect(decideDegradation({ peerDeclaresBehavior: false, behaviorMandatory: false })).toBe('fallback');
  });
  it('rejects only when the undeclared behavior is mandatory', () => {
    expect(decideDegradation({ peerDeclaresBehavior: false, behaviorMandatory: true })).toBe('reject');
  });
});
