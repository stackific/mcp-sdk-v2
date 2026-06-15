/**
 * S42 — Interactive UI Extension II: UI-to-Host Dialect, Registry & Security.
 *
 * One test (or group) per acceptance criterion AC-42.1 … AC-42.25 from
 * stories/S42-ui-2.md, validating the dialect schemas, the §26.6 registry, the
 * §26.7 security/consent model, the §26.8 error contract, and the §26.9 SDK
 * scope split.
 */

import { describe, it, expect } from 'vitest';
import {
  UI_DIALECT_PROTOCOL_VERSION,
  isUiDialectProtocolVersion,
  UI_DISPLAY_MODES,
  UiDisplayModeSchema,
  UI_DIALECT_METHODS,
  UI_DIALECT_REGISTRY,
  isUiDialectMethodName,
  uiDialectRegistryEntry,
  UiInitializeParamsSchema,
  UiInitializeResultSchema,
  isUiInitializeResult,
  UiHostContextSchema,
  HostContextChangedParamsSchema,
  UiSandboxReportSchema,
  ToolInputParamsSchema,
  ToolResultParamsSchema,
  ToolCancelledParamsSchema,
  ToolsCallParamsSchema,
  OpenLinkParamsSchema,
  UiMessageParamsSchema,
  RequestDisplayModeParamsSchema,
  RequestDisplayModeResultSchema,
  UpdateModelContextParamsSchema,
  PingParamsSchema,
  SizeChangedParamsSchema,
  ResourceTeardownParamsSchema,
  SandboxResourceReadyParamsSchema,
  uiMayEmitBeforeInitResponse,
  checkHandshakeOrder,
  validateDialectMessage,
  buildDialectErrorResponse,
  methodNotFoundResponse,
  DECLINABLE_UI_REQUESTS,
  declineErrorCode,
  buildDeclineErrorResponse,
  mediateUiToolsCall,
  mediateOpenLink,
  mediateUiMessage,
  buildDisplayModeResult,
  buildPingResponse,
  buildTeardownResponse,
  grantedPermissions,
  buildSandboxReport,
  FORBIDDEN_UI_EXPOSURE_KEYS,
  ALLOWED_UI_EXPOSURE_KEYS,
  uiExposureIsClean,
  SANDBOX_DENIED_ACCESS,
  sandboxIsolationIsConforming,
  dialectIsOnlyChannel,
  DIALECT_CHANNEL_PATH,
  SERVER_SDK_OBLIGATIONS,
  HOST_ONLY_CONCERNS,
  isServerSdkObligation,
} from '../../protocol/ui-host.js';
import {
  METHOD_NOT_FOUND_CODE,
  INVALID_PARAMS_CODE,
  INTERNAL_ERROR_CODE,
  isValidErrorResponse,
} from '../../protocol/errors.js';
import { resolveCsp, DENY_BY_DEFAULT_CSP } from '../../protocol/ui.js';
import { classifyMessage } from '../../jsonrpc/framing.js';

// ─── AC-42.1 — every dialect message is §3-framed; names match registry byte-for-byte ──

describe('AC-42.1: dialect framing & verbatim registry names (R-26.5-a)', () => {
  it('the registry has 19 entries with verbatim names', () => {
    expect(UI_DIALECT_REGISTRY).toHaveLength(19);
    const names = UI_DIALECT_REGISTRY.map((e) => e.name);
    expect(names).toEqual([
      'ui/initialize',
      'ui/notifications/initialized',
      'ui/notifications/tool-input',
      'ui/notifications/tool-input-partial',
      'ui/notifications/tool-result',
      'ui/notifications/tool-cancelled',
      'tools/call',
      'resources/read',
      'ui/open-link',
      'ui/message',
      'ui/request-display-mode',
      'ui/update-model-context',
      'notifications/message',
      'ping',
      'ui/notifications/size-changed',
      'ui/notifications/host-context-changed',
      'ui/resource-teardown',
      'ui/notifications/sandbox-proxy-ready',
      'ui/notifications/sandbox-resource-ready',
    ]);
  });

  it('name matching is case-sensitive and byte-exact', () => {
    expect(isUiDialectMethodName('ui/initialize')).toBe(true);
    expect(isUiDialectMethodName('UI/Initialize')).toBe(false);
    expect(isUiDialectMethodName('ui/Initialize')).toBe(false);
    expect(isUiDialectMethodName(' ui/initialize')).toBe(false);
    expect(isUiDialectMethodName('ui/unknown')).toBe(false);
    expect(isUiDialectMethodName(42)).toBe(false);
  });

  it('a captured dialect message is a §3 JSON-RPC request/notification/response', () => {
    const req = { jsonrpc: '2.0', id: 1, method: 'ui/initialize', params: {} };
    expect(classifyMessage(req).kind).toBe('request');
    const note = { jsonrpc: '2.0', method: 'ui/notifications/initialized' };
    expect(classifyMessage(note).kind).toBe('notification');
    const res = { jsonrpc: '2.0', id: 1, result: {} };
    expect(classifyMessage(res).kind).toBe('result-response');
  });

  it('every request/notification registry entry validates through framing', () => {
    for (const entry of UI_DIALECT_REGISTRY) {
      const raw =
        entry.kind === 'request'
          ? { jsonrpc: '2.0', id: 1, method: entry.name, params: {} }
          : { jsonrpc: '2.0', method: entry.name };
      const cls = classifyMessage(raw);
      expect(cls.kind).toBe(entry.kind === 'request' ? 'request' : 'notification');
    }
  });

  it('uiDialectRegistryEntry resolves kind & sender', () => {
    expect(uiDialectRegistryEntry('ping')).toEqual({
      name: 'ping',
      kind: 'request',
      sender: 'ui-or-host',
    });
    expect(uiDialectRegistryEntry('not-a-method')).toBeUndefined();
  });
});

// ─── AC-42.2 — dialect version "2026-01-26", independent of core revision ──────

describe('AC-42.2: dialect protocol version (R-26.5-b)', () => {
  it('is the exact string "2026-01-26"', () => {
    expect(UI_DIALECT_PROTOCOL_VERSION).toBe('2026-01-26');
    expect(isUiDialectProtocolVersion('2026-01-26')).toBe(true);
    expect(isUiDialectProtocolVersion('2026-07-28')).toBe(false); // core revision
    expect(isUiDialectProtocolVersion('2026-01-27')).toBe(false);
  });

  it('is observably independent of the core revision string', () => {
    // The core protocol revision (§27.1) is "2026-07-28"; the dialect is distinct.
    expect(UI_DIALECT_PROTOCOL_VERSION).not.toBe('2026-07-28');
  });
});

// ─── AC-42.3 — no other dialect message precedes the ui/initialize response ────

describe('AC-42.3: handshake ordering (R-26.5.1-a)', () => {
  it('only ui/initialize may be emitted before the init response', () => {
    expect(uiMayEmitBeforeInitResponse('ui/initialize')).toBe(true);
    expect(uiMayEmitBeforeInitResponse('ui/notifications/initialized')).toBe(false);
    expect(uiMayEmitBeforeInitResponse('tools/call')).toBe(false);
    expect(uiMayEmitBeforeInitResponse('ping')).toBe(false);
  });

  it('flags a premature message before the response arrives', () => {
    expect(checkHandshakeOrder('awaiting-init-response', 'ui/initialize')).toEqual({ ok: true });
    expect(checkHandshakeOrder('awaiting-init-response', 'tools/call')).toEqual({
      ok: false,
      reason: 'premature-message',
      method: 'tools/call',
    });
    // initialized is only sent AFTER the response
    expect(checkHandshakeOrder('awaiting-init-response', 'ui/notifications/initialized')).toEqual({
      ok: false,
      reason: 'premature-message',
      method: 'ui/notifications/initialized',
    });
  });

  it('after init, any dialect message is allowed', () => {
    expect(checkHandshakeOrder('initialized', 'tools/call')).toEqual({ ok: true });
    expect(checkHandshakeOrder('initialized', 'ui/notifications/initialized')).toEqual({ ok: true });
  });
});

// ─── AC-42.4 — initialize result REQUIRES protocolVersion ──────────────────────

describe('AC-42.4: UiInitializeResult.protocolVersion required (R-26.5.1-b)', () => {
  it('accepts a result with a protocolVersion string', () => {
    const result = {
      protocolVersion: '2026-01-26',
      hostInfo: { name: 'ExampleHost', version: '1.0.0' },
      hostCapabilities: { openLinks: {} },
    };
    expect(isUiInitializeResult(result)).toBe(true);
    expect(UiInitializeResultSchema.parse(result).protocolVersion).toBe('2026-01-26');
  });

  it('rejects a result missing protocolVersion', () => {
    expect(isUiInitializeResult({ hostInfo: { name: 'H', version: '1' } })).toBe(false);
    expect(UiInitializeResultSchema.safeParse({}).success).toBe(false);
  });

  it('the ui/initialize params accept the spec wire example', () => {
    const params = {
      protocolVersion: '2026-01-26',
      clientInfo: { name: 'Get Time App', version: '1.0.0' },
      appCapabilities: {
        availableDisplayModes: ['inline', 'fullscreen', 'pip'],
        tools: { listChanged: true },
      },
    };
    expect(UiInitializeParamsSchema.safeParse(params).success).toBe(true);
    // every field optional → empty params valid
    expect(UiInitializeParamsSchema.safeParse({}).success).toBe(true);
  });
});

// ─── AC-42.5 — UI tools/call routed only after consent + policy ────────────────

describe('AC-42.5: mediate UI tools/call (R-26.5.3-a, R-26.7-i, R-26.7-j)', () => {
  const appMeta = { visibility: ['model', 'app'] as const };

  it('routes only when visibility=app AND policy allows AND user consented', () => {
    expect(
      mediateUiToolsCall({ uiMeta: appMeta, userConsented: true, policyAllows: true }),
    ).toEqual({ route: true });
  });

  it('does not reach the server without consent', () => {
    expect(
      mediateUiToolsCall({ uiMeta: appMeta, userConsented: false, policyAllows: true }),
    ).toEqual({ route: false, reason: 'no-consent' });
  });

  it('does not reach the server when policy forbids', () => {
    expect(
      mediateUiToolsCall({ uiMeta: appMeta, userConsented: true, policyAllows: false }),
    ).toEqual({ route: false, reason: 'policy' });
  });
});

// ─── AC-42.6 — reject UI tools/call when visibility lacks "app" ────────────────

describe('AC-42.6: reject non-app-visible tools/call (R-26.5.3-b, R-26.7-k)', () => {
  it('rejects when effective visibility excludes "app"', () => {
    expect(
      mediateUiToolsCall({
        uiMeta: { visibility: ['model'] },
        userConsented: true,
        policyAllows: true,
      }),
    ).toEqual({ route: false, reason: 'policy' });
  });

  it('rejects when the tool has no UI declaration at all', () => {
    expect(
      mediateUiToolsCall({ uiMeta: undefined, userConsented: true, policyAllows: true }),
    ).toEqual({ route: false, reason: 'policy' });
  });

  it('default visibility (omitted) includes "app" and may route', () => {
    expect(
      mediateUiToolsCall({ uiMeta: {}, userConsented: true, policyAllows: true }),
    ).toEqual({ route: true });
  });
});

// ─── AC-42.7 — UI resources/read mediated; decline = error, not silent drop ────

describe('AC-42.7: resources/read mediated, may decline (R-26.5.3-c)', () => {
  it('resources/read is a declinable UI request', () => {
    expect(DECLINABLE_UI_REQUESTS).toContain('resources/read');
  });

  it('a decline produces an error response (not a silent drop)', () => {
    const res = buildDeclineErrorResponse(7, 'policy');
    expect(isValidErrorResponse(res)).toBe(true);
    expect(res.error.code).toBe(INTERNAL_ERROR_CODE);
    expect(res.id).toBe(7);
  });

  it('ToolsCallParams/resources/read params validate against the §16 shape', () => {
    expect(ToolsCallParamsSchema.safeParse({ name: 'get-time', arguments: {} }).success).toBe(true);
    expect(ToolsCallParamsSchema.safeParse({ name: 'x' }).success).toBe(true);
    expect(ToolsCallParamsSchema.safeParse({ arguments: {} }).success).toBe(false);
  });
});

// ─── AC-42.8 — ui/open-link MAY decline, SHOULD confirm ────────────────────────

describe('AC-42.8: ui/open-link consent (R-26.5.3-d, R-26.7-l)', () => {
  it('honors only when host chooses to AND user confirmed', () => {
    expect(mediateOpenLink(true, true)).toEqual({ route: true });
  });

  it('a non-confirming auto-open is flagged', () => {
    expect(mediateOpenLink(true, false)).toEqual({ route: false, reason: 'no-consent' });
  });

  it('host may decline outright', () => {
    expect(mediateOpenLink(false, true)).toEqual({ route: false, reason: 'policy' });
  });

  it('ui/message uses the same confirm-before-insert gate', () => {
    expect(mediateUiMessage(true, true)).toEqual({ route: true });
    expect(mediateUiMessage(true, false)).toEqual({ route: false, reason: 'no-consent' });
  });

  it('OpenLinkParams / UiMessageParams validate', () => {
    expect(OpenLinkParamsSchema.safeParse({ url: 'https://x' }).success).toBe(true);
    expect(OpenLinkParamsSchema.safeParse({}).success).toBe(false);
    expect(
      UiMessageParamsSchema.safeParse({ role: 'user', content: { type: 'text', text: 'hi' } }).success,
    ).toBe(true);
    expect(
      UiMessageParamsSchema.safeParse({ role: 'assistant', content: { type: 'text', text: 'x' } })
        .success,
    ).toBe(false);
  });
});

// ─── AC-42.9 — display mode result reports the applied (maybe different) mode ──

describe('AC-42.9: request-display-mode result reports applied mode (R-26.5.3-e)', () => {
  it('result mode is the host-applied mode, which may differ from requested', () => {
    expect(buildDisplayModeResult('fullscreen', 'pip')).toEqual({ mode: 'pip' });
    expect(buildDisplayModeResult('inline', 'inline')).toEqual({ mode: 'inline' });
  });

  it('params and result validate against the display-mode enum', () => {
    expect(RequestDisplayModeParamsSchema.safeParse({ mode: 'fullscreen' }).success).toBe(true);
    expect(RequestDisplayModeResultSchema.safeParse({ mode: 'pip' }).success).toBe(true);
    expect(RequestDisplayModeParamsSchema.safeParse({ mode: 'floating' }).success).toBe(false);
    expect(UI_DISPLAY_MODES).toEqual(['inline', 'fullscreen', 'pip']);
    expect(UiDisplayModeSchema.safeParse('pip').success).toBe(true);
  });
});

// ─── AC-42.10 — ping carries no params; receiver returns empty result promptly ─

describe('AC-42.10: ping liveness (R-26.5.3-f, R-26.5.3-g)', () => {
  it('PingParams is an empty object', () => {
    expect(PingParamsSchema.safeParse({}).success).toBe(true);
  });

  it('a ping yields an empty success result echoing the id', () => {
    const res = buildPingResponse(4);
    expect(res).toEqual({ jsonrpc: '2.0', id: 4, result: {} });
    expect(classifyMessage(res).kind).toBe('result-response');
  });

  it('ping may be sent in either direction (registry sender is ui-or-host)', () => {
    expect(uiDialectRegistryEntry('ping')?.sender).toBe('ui-or-host');
  });
});

// ─── AC-42.11 — resource-teardown: release & respond with {} ───────────────────

describe('AC-42.11: ui/resource-teardown (R-26.5.4-a)', () => {
  it('teardown params require a reason', () => {
    expect(ResourceTeardownParamsSchema.safeParse({ reason: 'conversation-closed' }).success).toBe(
      true,
    );
    expect(ResourceTeardownParamsSchema.safeParse({}).success).toBe(false);
  });

  it('the UI responds with an empty object {}', () => {
    const res = buildTeardownResponse(9);
    expect(res).toEqual({ jsonrpc: '2.0', id: 9, result: {} });
  });
});

// ─── AC-42.12 / AC-42.13 — sandbox isolation; dialect is the only channel ──────

describe('AC-42.12 & AC-42.13: sandbox isolation & single channel (R-26.7-a/b/c)', () => {
  it('denies DOM, cookies, storage, navigation', () => {
    expect(SANDBOX_DENIED_ACCESS).toEqual(['dom', 'cookies', 'storage', 'navigation']);
    expect(sandboxIsolationIsConforming(['dom', 'cookies', 'storage', 'navigation'])).toBe(true);
  });

  it('a config missing any denied category is non-conforming', () => {
    expect(sandboxIsolationIsConforming(['dom', 'cookies', 'storage'])).toBe(false);
  });

  it('the dialect channel is the only granted path', () => {
    expect(dialectIsOnlyChannel([DIALECT_CHANNEL_PATH])).toBe(true);
    expect(dialectIsOnlyChannel([DIALECT_CHANNEL_PATH, 'direct-cookie-access'])).toBe(false);
    expect(dialectIsOnlyChannel([])).toBe(false);
  });
});

// ─── AC-42.14 — CSP enforcement: declared origins / deny-by-default ────────────

describe('AC-42.14: CSP enforcement (R-26.7-d/e/f)', () => {
  it('with a declared csp, the effective policy is exactly the declared origins', () => {
    const declared = { connectDomains: ['https://api.example.com'] };
    expect(resolveCsp(declared)).toBe(declared);
  });

  it('with no declared csp, deny-by-default blocks all external origins', () => {
    expect(resolveCsp(undefined)).toBe(DENY_BY_DEFAULT_CSP);
    expect(DENY_BY_DEFAULT_CSP.connectDomains).toEqual([]);
    expect(DENY_BY_DEFAULT_CSP.resourceDomains).toEqual([]);
  });
});

// ─── AC-42.15 / AC-42.16 — sandbox report: effective csp + granted permissions ─

describe('AC-42.15 & AC-42.16: sandbox report (R-26.7-g, R-26.7-h)', () => {
  it('granted permissions are a subset of requested; never grant the unrequested', () => {
    const requested = { clipboardWrite: {}, camera: {} };
    // host declines camera
    const granted = grantedPermissions(requested, ['camera']);
    expect(granted).toEqual({ clipboardWrite: {} });
    expect(granted).not.toHaveProperty('camera');
  });

  it('an undefined requested set grants nothing', () => {
    expect(grantedPermissions(undefined)).toEqual({});
  });

  it('a permission not requested can never be granted even if not declined', () => {
    const granted = grantedPermissions({ clipboardWrite: {} });
    expect(granted).toEqual({ clipboardWrite: {} });
    // geolocation was never requested → absent
    expect(granted).not.toHaveProperty('geolocation');
  });

  it('the sandbox report carries effective csp + granted permissions', () => {
    const report = buildSandboxReport(
      { connectDomains: ['https://api.example.com'] },
      { clipboardWrite: {} },
    );
    expect(report).toEqual({
      csp: { connectDomains: ['https://api.example.com'] },
      permissions: { clipboardWrite: {} },
    });
    expect(UiSandboxReportSchema.safeParse(report).success).toBe(true);
  });
});

// ─── AC-42.17 — only tool input/result + host context exposed to the UI ────────

describe('AC-42.17: no credential/context leakage (R-26.7-m)', () => {
  it('clean exposure contains only the allowed categories', () => {
    expect(ALLOWED_UI_EXPOSURE_KEYS).toEqual(['toolInput', 'toolResult', 'hostContext']);
    expect(uiExposureIsClean({ toolInput: {}, toolResult: {}, hostContext: {} })).toBe(true);
  });

  it('exposing a credential/token/cookie/conversation datum is dirty', () => {
    for (const key of FORBIDDEN_UI_EXPOSURE_KEYS) {
      expect(uiExposureIsClean({ toolInput: {}, [key]: 'secret' })).toBe(false);
    }
  });

  it('any unforeseen key is dirty (allow-list, not deny-list)', () => {
    expect(uiExposureIsClean({ surpriseLeak: 1 })).toBe(false);
  });
});

// ─── AC-42.18 — validate framing before acting; content untrusted ──────────────

describe('AC-42.18: message validation before acting (R-26.7-n, R-26.7-o)', () => {
  it('a well-framed dialect request validates and resolves its registry entry', () => {
    const v = validateDialectMessage({ jsonrpc: '2.0', id: 1, method: 'ui/initialize', params: {} });
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.kind).toBe('request');
      expect(v.entry?.name).toBe('ui/initialize');
    }
  });

  it('a batch / bad jsonrpc / contradictory message is malformed-framing, never throws', () => {
    expect(validateDialectMessage([{ jsonrpc: '2.0' }])).toMatchObject({
      ok: false,
      reason: 'malformed-framing',
    });
    expect(validateDialectMessage({ jsonrpc: '1.0', id: 1, method: 'ping' })).toMatchObject({
      ok: false,
      reason: 'malformed-framing',
    });
    expect(validateDialectMessage('not-an-object')).toMatchObject({
      ok: false,
      reason: 'malformed-framing',
    });
  });

  it('a well-framed but unknown method is flagged as unknown-method', () => {
    expect(
      validateDialectMessage({ jsonrpc: '2.0', id: 1, method: 'ui/bogus', params: {} }),
    ).toMatchObject({ ok: false, reason: 'unknown-method' });
  });

  it('responses pass framing-only (no method)', () => {
    const v = validateDialectMessage({ jsonrpc: '2.0', id: 1, result: {} });
    expect(v).toMatchObject({ ok: true, kind: 'response' });
  });
});

// ─── AC-42.19 — failed dialect request answered with JSON-RPC error ────────────

describe('AC-42.19: failed request → JSON-RPC error (R-26.8-a)', () => {
  it('builds a §3/§22-conforming error response', () => {
    const res = buildDialectErrorResponse(2, INVALID_PARAMS_CODE, 'bad params', { field: 'url' });
    expect(isValidErrorResponse(res)).toBe(true);
    expect(res).toEqual({
      jsonrpc: '2.0',
      id: 2,
      error: { code: INVALID_PARAMS_CODE, message: 'bad params', data: { field: 'url' } },
    });
  });
});

// ─── AC-42.20 — declined UI request → error, never silent drop ─────────────────

describe('AC-42.20: declined requests return errors (R-26.8-b)', () => {
  it('the five declinable UI requests are enumerated', () => {
    expect([...DECLINABLE_UI_REQUESTS]).toEqual([
      'tools/call',
      'resources/read',
      'ui/open-link',
      'ui/message',
      'ui/update-model-context',
    ]);
  });

  it('each decline reason maps to a §22 code and never drops silently', () => {
    expect(declineErrorCode('unknown-method')).toBe(METHOD_NOT_FOUND_CODE);
    expect(declineErrorCode('invalid-params')).toBe(INVALID_PARAMS_CODE);
    expect(declineErrorCode('no-consent')).toBe(INTERNAL_ERROR_CODE);
    expect(declineErrorCode('policy')).toBe(INTERNAL_ERROR_CODE);

    for (const reason of ['no-consent', 'policy', 'unknown-method', 'invalid-params'] as const) {
      const res = buildDeclineErrorResponse(3, reason);
      expect(isValidErrorResponse(res)).toBe(true);
      expect(res.id).toBe(3);
    }
  });
});

// ─── AC-42.21 — unimplemented method → method-not-found ────────────────────────

describe('AC-42.21: unimplemented method → -32601 (R-26.8-c)', () => {
  it('method-not-found response uses -32601', () => {
    const res = methodNotFoundResponse(2);
    expect(res.error.code).toBe(METHOD_NOT_FOUND_CODE);
    expect(res.error.code).toBe(-32601);
    expect(isValidErrorResponse(res)).toBe(true);
    expect(res.id).toBe(2);
  });

  it('matches the spec wire example for a declined unknown method', () => {
    const res = methodNotFoundResponse(2);
    expect(res).toEqual({
      jsonrpc: '2.0',
      id: 2,
      error: { code: -32601, message: 'Method not found' },
    });
  });
});

// ─── AC-42.22 — AC-42.24 — server-SDK obligations ──────────────────────────────

describe('AC-42.22–AC-42.24: server-SDK obligations (R-26.9-a/b/c)', () => {
  it('the three server obligations are enumerated', () => {
    expect([...SERVER_SDK_OBLIGATIONS]).toEqual([
      'acknowledge-extension',
      'declare-ui-meta',
      'serve-ui-resource',
    ]);
  });

  it('each is recognized as a server-SDK obligation', () => {
    expect(isServerSdkObligation('acknowledge-extension')).toBe(true);
    expect(isServerSdkObligation('declare-ui-meta')).toBe(true);
    expect(isServerSdkObligation('serve-ui-resource')).toBe(true);
  });
});

// ─── AC-42.25 — host-only concerns are NOT server-SDK obligations ──────────────

describe('AC-42.25: host-only concerns not server obligations (R-26.9-d)', () => {
  it('rendering / sandboxing / CSP / runtime / consent are host-only', () => {
    expect([...HOST_ONLY_CONCERNS]).toEqual([
      'render-sandboxed',
      'enforce-csp-permissions',
      'run-dialect-runtime',
      'obtain-consent',
    ]);
    for (const concern of HOST_ONLY_CONCERNS) {
      expect(isServerSdkObligation(concern)).toBe(false);
    }
  });
});

// ─── Data-structure coverage: Host → UI delivery + lifecycle params ────────────

describe('Host → UI delivery & lifecycle params (§26.5.2, §26.5.4, §26.5.5)', () => {
  it('ToolInputParams requires arguments map', () => {
    expect(ToolInputParamsSchema.safeParse({ arguments: { city: 'NYC' } }).success).toBe(true);
    expect(ToolInputParamsSchema.safeParse({}).success).toBe(false);
  });

  it('ToolResultParams accepts §16 tool-result shape with content blocks', () => {
    const ok = ToolResultParamsSchema.safeParse({
      content: [{ type: 'text', text: '2026-07-28T12:00:00Z' }],
      isError: false,
    });
    expect(ok.success).toBe(true);
    // a forbidden sampling content type is rejected by ContentBlockSchema reuse
    expect(
      ToolResultParamsSchema.safeParse({ content: [{ type: 'tool_use', id: 'x' }] }).success,
    ).toBe(false);
  });

  it('ToolCancelledParams requires a reason', () => {
    expect(ToolCancelledParamsSchema.safeParse({ reason: 'user-abort' }).success).toBe(true);
    expect(ToolCancelledParamsSchema.safeParse({}).success).toBe(false);
  });

  it('SizeChangedParams requires width and height', () => {
    expect(SizeChangedParamsSchema.safeParse({ width: 640, height: 480 }).success).toBe(true);
    expect(SizeChangedParamsSchema.safeParse({ width: 640 }).success).toBe(false);
  });

  it('UpdateModelContextParams is all-optional with content blocks', () => {
    expect(UpdateModelContextParamsSchema.safeParse({}).success).toBe(true);
    expect(
      UpdateModelContextParamsSchema.safeParse({ content: [{ type: 'text', text: 'x' }] }).success,
    ).toBe(true);
  });

  it('UiHostContext validates the spec wire example & a partial change', () => {
    const ctx = {
      theme: 'dark',
      displayMode: 'inline',
      locale: 'en-US',
      platform: 'web',
      containerDimensions: { width: 640, maxHeight: 480 },
    };
    expect(UiHostContextSchema.safeParse(ctx).success).toBe(true);
    // host-context-changed carries only the changed members
    expect(HostContextChangedParamsSchema.safeParse({ theme: 'light' }).success).toBe(true);
    expect(UiHostContextSchema.safeParse({ theme: 'sepia' }).success).toBe(false);
  });

  it('SandboxResourceReadyParams requires html and accepts csp/permissions', () => {
    expect(
      SandboxResourceReadyParamsSchema.safeParse({
        html: '<div>hi</div>',
        sandbox: 'allow-scripts',
        csp: { connectDomains: ['https://api.example.com'] },
        permissions: { clipboardWrite: {} },
      }).success,
    ).toBe(true);
    expect(SandboxResourceReadyParamsSchema.safeParse({}).success).toBe(false);
  });
});

// ─── Method-name constants sanity: notifications/message reuses core name ──────

describe('UI_DIALECT_METHODS constants', () => {
  it('reuses the core logging method name verbatim', () => {
    expect(UI_DIALECT_METHODS.LOG_MESSAGE).toBe('notifications/message');
  });

  it('all method constants are dialect names', () => {
    for (const name of Object.values(UI_DIALECT_METHODS)) {
      expect(isUiDialectMethodName(name)).toBe(true);
    }
  });
});
