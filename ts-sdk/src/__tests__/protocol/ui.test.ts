/**
 * S41 — Interactive UI Extension I (§26.1–§26.4) tests.
 *
 * Every numbered AC (AC-41.1 .. AC-41.44) is covered. Host-only obligations
 * (rendering, sandboxing, the channel, consent) are exercised through the
 * declarative model the SDK exposes — a conforming server SDK has no browser/UI
 * dependency, so those rules are validated as role assignments and predicates a
 * host implementation consults, not by rendering anything (AC-41.10).
 */

import { describe, it, expect } from 'vitest';
import {
  UI_EXTENSION_ID,
  UI_MIME_TYPE,
  isUiMimeType,
  UI_URI_SCHEME,
  isUiResourceUri,
  UI_RESPONSIBILITY_OWNER,
  uiResponsibilityOwner,
  isServerResponsibility,
  UiHostExtensionCapabilitySchema,
  isUiHostExtensionCapability,
  capabilityRendersUi,
  buildUiHostExtensionCapability,
  getUiHostCapability,
  hostAdvertisesUiRendering,
  requestAdvertisesUiRendering,
  mayServerDeclareUi,
  mayServerExpectRendering,
  isUiExtensionActive,
  mayEmitUiSurface,
  ServerUiAcknowledgementSchema,
  buildServerUiAcknowledgement,
  serverAcknowledgesUi,
  TOOL_UI_META_KEY,
  UI_VISIBILITY_VALUES,
  UiVisibilitySchema,
  DEFAULT_UI_VISIBILITY,
  ToolUiMetaSchema,
  isToolUiMeta,
  getToolUiMeta,
  readToolUiMeta,
  effectiveVisibility,
  isAppInvokable,
  hostShouldRejectUiOriginatedCall,
  isVisibleToModel,
  toolsVisibleToModel,
  UiContentSecurityPolicySchema,
  UI_CSP_DIRECTIVES,
  cspAllowsOrigin,
  DENY_BY_DEFAULT_CSP,
  resolveCsp,
  UiPermissionsSchema,
  UI_PERMISSION_NAMES,
  permissionRequested,
  requestedPermissions,
  mayGrantPermission,
  ResourceUiMetaSchema,
  isResourceUiMeta,
  UiResourceContentsSchema,
  isUiResourceContents,
  getResourceUiMeta,
  buildUiResourceContents,
  buildUiResourceReadResult,
  uiResourceReadUri,
  type ToolUiMeta,
} from '../../protocol/ui.js';

const RENDERING_CAP = { mimeTypes: [UI_MIME_TYPE] };
const RENDERING_MAP = { [UI_EXTENSION_ID]: RENDERING_CAP };

// ─── §26.1 Purpose & roles (AC-41.1 .. AC-41.10) ────────────────────────────────

describe('§26.1 purpose and role split', () => {
  it('AC-41.1: the extension identifier names an OPTIONAL extension; omitting it is conformant', () => {
    // The extension is gated through the negotiation map; absence => inactive,
    // and an implementation that never advertises it remains conformant.
    expect(UI_EXTENSION_ID).toBe('io.modelcontextprotocol/ui');
    expect(isUiExtensionActive({}, {})).toBe(false);
  });

  it('AC-41.2: a server MAY declare UI but need not — gating is permissive, not mandatory', () => {
    // When a host advertises rendering, declaring is permitted (MAY), not forced.
    expect(mayServerDeclareUi(RENDERING_MAP)).toBe(true);
    // A server that simply does not declare any _meta.ui is equally fine.
    expect(getToolUiMeta({ name: 't', _meta: {} })).toBeUndefined();
  });

  it('AC-41.3: declaring _meta.ui is a SERVER responsibility', () => {
    expect(uiResponsibilityOwner('declare-ui-meta')).toBe('server');
    expect(isServerResponsibility('declare-ui-meta')).toBe(true);
  });

  it('AC-41.4: serving the ui:// resource is a SERVER responsibility', () => {
    expect(uiResponsibilityOwner('serve-ui-resource')).toBe('server');
    expect(isServerResponsibility('serve-ui-resource')).toBe(true);
  });

  it('AC-41.5: rendering, sandboxing and running the channel are NOT server responsibilities', () => {
    for (const r of ['render', 'sandbox', 'run-channel'] as const) {
      expect(isServerResponsibility(r)).toBe(false);
    }
  });

  it('AC-41.6: rendering in a sandboxed isolated context is a HOST responsibility', () => {
    expect(uiResponsibilityOwner('render')).toBe('host');
    expect(uiResponsibilityOwner('sandbox')).toBe('host');
  });

  it('AC-41.7: enforcing CSP and permissions is a HOST responsibility', () => {
    expect(uiResponsibilityOwner('enforce-csp')).toBe('host');
  });

  it('AC-41.8: running the message-channel dialect is a HOST responsibility', () => {
    expect(uiResponsibilityOwner('run-channel')).toBe('host');
  });

  it('AC-41.9: mediating/obtaining user consent is a HOST responsibility', () => {
    expect(uiResponsibilityOwner('mediate-consent')).toBe('host');
  });

  it('AC-41.10: the server-SDK surface has no rendering/browser/UI-toolkit dependency', () => {
    // The whole module is importable and usable with no DOM globals present.
    expect(typeof globalThis.document).toBe('undefined');
    // Every server-owned responsibility is exactly the two declarative ones.
    const serverOwned = Object.entries(UI_RESPONSIBILITY_OWNER)
      .filter(([, role]) => role === 'server')
      .map(([k]) => k)
      .sort();
    expect(serverOwned).toEqual(['declare-ui-meta', 'serve-ui-resource']);
  });
});

// ─── §26.2 Identifier & capability negotiation (AC-41.11 .. AC-41.20) ────────────

describe('§26.2 identifier and capability negotiation', () => {
  it('AC-41.11: extension absent from the negotiated map => treated as inactive', () => {
    expect(isUiExtensionActive({}, RENDERING_MAP)).toBe(false);
    expect(isUiExtensionActive(RENDERING_MAP, {})).toBe(false);
    expect(mayEmitUiSurface([])).toBe(false);
  });

  it('AC-41.12: the identifier matches as an opaque, case-sensitive string', () => {
    expect(UI_EXTENSION_ID).toBe('io.modelcontextprotocol/ui');
    // A case-folded variant does not activate the extension.
    const wrongCase = { 'IO.ModelContextProtocol/UI': RENDERING_CAP };
    expect(isUiExtensionActive(wrongCase, RENDERING_MAP)).toBe(false);
    expect(hostAdvertisesUiRendering(wrongCase)).toBe(false);
  });

  it('AC-41.13: a host that supports UIs advertises the key in clientCapabilities.extensions of each request', () => {
    const requestMeta = {
      'io.modelcontextprotocol/clientCapabilities': {
        extensions: RENDERING_MAP,
      },
    };
    expect(requestAdvertisesUiRendering(requestMeta)).toBe(true);
    // A request whose _meta omits the advertisement is judged on its own.
    expect(requestAdvertisesUiRendering({ 'io.modelcontextprotocol/clientCapabilities': { extensions: {} } })).toBe(false);
    expect(requestAdvertisesUiRendering({})).toBe(false);
  });

  it('AC-41.14: UiHostExtensionCapability requires a mimeTypes array; omission is non-conformant', () => {
    expect(UiHostExtensionCapabilitySchema.safeParse({ mimeTypes: [UI_MIME_TYPE] }).success).toBe(true);
    expect(UiHostExtensionCapabilitySchema.safeParse({}).success).toBe(false);
    expect(isUiHostExtensionCapability({ mimeTypes: 'not-an-array' })).toBe(false);
  });

  it('AC-41.15: mimeTypes must include the exact, whitespace-free, case-sensitive UI MIME type', () => {
    expect(UI_MIME_TYPE).toBe('text/html;profile=mcp-app');
    expect(isUiMimeType('text/html;profile=mcp-app')).toBe(true);
    expect(isUiMimeType('text/html; profile=mcp-app')).toBe(false); // extra space
    expect(isUiMimeType('TEXT/HTML;PROFILE=MCP-APP')).toBe(false); // wrong case
    expect(capabilityRendersUi({ mimeTypes: ['text/html; profile=mcp-app'] })).toBe(false);
    expect(capabilityRendersUi({ mimeTypes: ['text/html', UI_MIME_TYPE] })).toBe(true);
  });

  it('AC-41.16: host without the required MIME type => server MUST NOT declare UI associations', () => {
    const noUi = { [UI_EXTENSION_ID]: { mimeTypes: ['text/html'] } };
    expect(mayServerDeclareUi(noUi)).toBe(false);
    expect(mayServerDeclareUi({})).toBe(false);
    expect(mayServerDeclareUi(RENDERING_MAP)).toBe(true);
  });

  it('AC-41.17: host without the required MIME type => server MUST NOT expect rendering', () => {
    expect(mayServerExpectRendering({ [UI_EXTENSION_ID]: { mimeTypes: [] } })).toBe(false);
    expect(mayServerExpectRendering(RENDERING_MAP)).toBe(true);
  });

  it('AC-41.18: host that has not negotiated the extension => tools MAY still be exposed as ordinary tools', () => {
    // Inactive extension: _meta.ui is ignored, the tool stays in the model list.
    const tool = { name: 'get-time', _meta: { ui: { resourceUri: 'ui://x' } } };
    const visible = toolsVisibleToModel([tool], []); // empty active set
    expect(visible).toEqual([tool]);
  });

  it('AC-41.19: non-negotiated host treats the tool as normal and ignores the UI key', () => {
    const tool = { name: 'get-time', _meta: { ui: { resourceUri: 'ui://x', visibility: ['app'] } } };
    // Without the extension active, readToolUiMeta returns nothing (key ignored).
    expect(readToolUiMeta(tool, [])).toBeUndefined();
    // ...and even an ["app"]-only tool stays model-visible when extension inactive.
    expect(toolsVisibleToModel([tool], [])).toEqual([tool]);
  });

  it('AC-41.20: a server MAY acknowledge the extension under capabilities.extensions with an empty object', () => {
    const ack = buildServerUiAcknowledgement();
    expect(ack).toEqual({ [UI_EXTENSION_ID]: {} });
    expect(ServerUiAcknowledgementSchema.safeParse({}).success).toBe(true);
    expect(serverAcknowledgesUi(ack)).toBe(true);
    expect(serverAcknowledgesUi({})).toBe(false);
  });

  it('getUiHostCapability reads a well-formed advertisement, else undefined', () => {
    expect(getUiHostCapability(RENDERING_MAP)).toEqual(RENDERING_CAP);
    expect(getUiHostCapability({ [UI_EXTENSION_ID]: { mimeTypes: 1 } })).toBeUndefined();
    expect(getUiHostCapability({})).toBeUndefined();
  });

  it('buildUiHostExtensionCapability always includes the UI MIME type and dedupes', () => {
    expect(buildUiHostExtensionCapability()).toEqual({ mimeTypes: [UI_MIME_TYPE] });
    expect(buildUiHostExtensionCapability(['text/html', UI_MIME_TYPE])).toEqual({
      mimeTypes: [UI_MIME_TYPE, 'text/html'],
    });
    expect(capabilityRendersUi(buildUiHostExtensionCapability(['image/svg+xml']))).toBe(true);
  });

  it('isUiExtensionActive requires both sides to advertise (intersection)', () => {
    expect(isUiExtensionActive(RENDERING_MAP, { [UI_EXTENSION_ID]: {} })).toBe(true);
    expect(mayEmitUiSurface([UI_EXTENSION_ID])).toBe(true);
  });
});

// ─── §26.3 Declaring a UI on a tool (AC-41.21 .. AC-41.28) ──────────────────────

describe('§26.3 the _meta.ui tool declaration', () => {
  const baseMeta: ToolUiMeta = { resourceUri: 'ui://get-time/mcp-app.html', visibility: ['model', 'app'] };

  it('exposes the reserved nested key path and enum values', () => {
    expect(TOOL_UI_META_KEY).toBe('ui');
    expect(UI_VISIBILITY_VALUES).toEqual(['model', 'app']);
    expect(UiVisibilitySchema.safeParse('model').success).toBe(true);
    expect(UiVisibilitySchema.safeParse('agent').success).toBe(false);
  });

  it('AC-41.21: resourceUri is required; absence is non-conformant', () => {
    expect(ToolUiMetaSchema.safeParse({ visibility: ['model'] }).success).toBe(false);
    expect(ToolUiMetaSchema.safeParse(baseMeta).success).toBe(true);
    expect(isToolUiMeta(baseMeta)).toBe(true);
  });

  it('AC-41.22: resourceUri must use the ui:// scheme; non-ui:// is rejected', () => {
    expect(isUiResourceUri('ui://x/y.html')).toBe(true);
    expect(isUiResourceUri('https://example.com/x.html')).toBe(false);
    expect(UI_URI_SCHEME).toBe('ui://');
    expect(ToolUiMetaSchema.safeParse({ resourceUri: 'https://example.com' }).success).toBe(false);
    expect(ToolUiMetaSchema.safeParse({ resourceUri: 'ui://ok' }).success).toBe(true);
  });

  it('AC-41.23: the host reads via resources/read for that exact URI', () => {
    const meta = getToolUiMeta({ _meta: { ui: baseMeta } });
    expect(uiResourceReadUri(meta)).toBe('ui://get-time/mcp-app.html');
    // The exact declared string is returned verbatim (opaque identifier).
    expect(uiResourceReadUri({ resourceUri: 'ui://A/b?c=d#e' })).toBe('ui://A/b?c=d#e');
  });

  it('AC-41.24: omitted visibility => ["model","app"]; present elements must be the enum strings', () => {
    expect(effectiveVisibility({ visibility: undefined })).toEqual(['model', 'app']);
    expect([...DEFAULT_UI_VISIBILITY]).toEqual(['model', 'app']);
    expect(effectiveVisibility({ visibility: ['app'] })).toEqual(['app']);
    expect(ToolUiMetaSchema.safeParse({ resourceUri: 'ui://x', visibility: ['model', 'nope'] }).success).toBe(false);
  });

  it('AC-41.25: host SHOULD reject a UI-originated call when effective visibility excludes "app"', () => {
    expect(hostShouldRejectUiOriginatedCall({ visibility: ['model'] })).toBe(true);
    expect(hostShouldRejectUiOriginatedCall({ visibility: ['model', 'app'] })).toBe(false);
    expect(isAppInvokable({ visibility: ['app'] })).toBe(true);
    // Default visibility includes "app", so a UI-originated call is allowed.
    expect(hostShouldRejectUiOriginatedCall({ visibility: undefined })).toBe(false);
    // A tool with no UI declaration was never UI-exposed => reject.
    expect(hostShouldRejectUiOriginatedCall(undefined)).toBe(true);
  });

  it('AC-41.26: a ["app"]-only tool is hidden from the model list and callable only by the UI', () => {
    const appOnly = { name: 'a', _meta: { ui: { resourceUri: 'ui://a', visibility: ['app'] } } };
    const modelTool = { name: 'm', _meta: { ui: { resourceUri: 'ui://m', visibility: ['model'] } } };
    expect(isVisibleToModel({ visibility: ['app'] })).toBe(false);
    const visible = toolsVisibleToModel([appOnly, modelTool], [UI_EXTENSION_ID]);
    expect(visible.map((t) => t.name)).toEqual(['m']);
    // ...but it remains app-invokable.
    expect(isAppInvokable({ visibility: ['app'] })).toBe(true);
  });

  it('AC-41.27: a receiver that has not negotiated the extension ignores _meta.ui', () => {
    const tool = { _meta: { ui: { resourceUri: 'ui://x' } } };
    expect(readToolUiMeta(tool, [])).toBeUndefined(); // inactive => ignored
    expect(readToolUiMeta(tool, [UI_EXTENSION_ID])).toEqual({ resourceUri: 'ui://x' });
  });

  it('AC-41.28: presence of _meta.ui MUST NOT change ordinary tools/call behavior', () => {
    // The declaration is pure metadata: extracting it never mutates the tool,
    // and a tool default-visible to the model is unaffected by the key's presence.
    const withUi = { name: 't', _meta: { ui: { resourceUri: 'ui://t' } } };
    const without = { name: 't' };
    const before = JSON.stringify(withUi);
    getToolUiMeta(withUi);
    expect(JSON.stringify(withUi)).toBe(before);
    // Both are model-visible (the key adds no model-facing behavior change).
    expect(toolsVisibleToModel([withUi], [UI_EXTENSION_ID]).map((t) => t.name)).toEqual(['t']);
    expect(toolsVisibleToModel([without], [UI_EXTENSION_ID]).map((t) => t.name)).toEqual(['t']);
  });

  it('getToolUiMeta returns undefined for missing/malformed declarations', () => {
    expect(getToolUiMeta({})).toBeUndefined();
    expect(getToolUiMeta({ _meta: {} })).toBeUndefined();
    expect(getToolUiMeta({ _meta: { ui: { resourceUri: 'https://x' } } })).toBeUndefined();
    expect(getToolUiMeta(null)).toBeUndefined();
  });
});

// ─── §26.4 The UI resource & ui:// scheme (AC-41.29 .. AC-41.33) ────────────────

describe('§26.4 the UI resource and ui:// scheme', () => {
  it('AC-41.29: a host MAY preload the resource before the tool is called', () => {
    // Preloading is just reading by URI; the read URI is available independent of
    // any tool call having occurred.
    const meta = { resourceUri: 'ui://preload/me.html' };
    expect(uiResourceReadUri(meta)).toBe('ui://preload/me.html');
  });

  it('AC-41.30: the host treats the whole ui:// URI as opaque; authority/path are server-defined', () => {
    // Arbitrary server-defined authority/path are accepted as-is, unparsed.
    expect(isUiResourceUri('ui://anything/at/all?q=1')).toBe(true);
    expect(uiResourceReadUri({ resourceUri: 'ui://anything/at/all?q=1' })).toBe('ui://anything/at/all?q=1');
  });

  it('AC-41.31: the host derives no network origin from the ui:// URI', () => {
    // The SDK never parses a host/origin out of a ui:// URI — only the scheme is
    // checked, and the URI is carried verbatim.
    const uri = 'ui://not-a-real-host.example/x';
    expect(isUiResourceUri(uri)).toBe(true);
    expect(uiResourceReadUri({ resourceUri: uri })).toBe(uri);
  });

  it('AC-41.32: UI resource content mimeType is exactly the verbatim UI MIME type', () => {
    const ok = { uri: 'ui://x', mimeType: UI_MIME_TYPE, text: '<html></html>' };
    expect(isUiResourceContents(ok)).toBe(true);
    expect(UiResourceContentsSchema.safeParse({ ...ok, mimeType: 'text/html' }).success).toBe(false);
    expect(UiResourceContentsSchema.safeParse({ ...ok, mimeType: 'text/html; profile=mcp-app' }).success).toBe(false);
  });

  it('UI resource content accepts text or blob (S21 exclusivity), but not both', () => {
    expect(isUiResourceContents({ uri: 'ui://x', mimeType: UI_MIME_TYPE, blob: 'AAAA' })).toBe(true);
    expect(
      UiResourceContentsSchema.safeParse({ uri: 'ui://x', mimeType: UI_MIME_TYPE, text: 'a', blob: 'AAAA' }).success,
    ).toBe(false);
  });

  it('AC-41.33: a contents entry MAY carry a _meta.ui hints object that takes effect', () => {
    const contents = {
      uri: 'ui://x',
      mimeType: UI_MIME_TYPE,
      text: '<html></html>',
      _meta: { ui: { csp: { connectDomains: ['https://api.example.com'] }, prefersBorder: true } },
    };
    expect(isUiResourceContents(contents)).toBe(true);
    const hints = getResourceUiMeta(contents);
    expect(hints?.prefersBorder).toBe(true);
    expect(hints?.csp?.connectDomains).toEqual(['https://api.example.com']);
    // No hints => undefined.
    expect(getResourceUiMeta({ uri: 'ui://x', mimeType: UI_MIME_TYPE, text: 'a' })).toBeUndefined();
    // Malformed hints are rejected by the content schema.
    expect(
      UiResourceContentsSchema.safeParse({
        uri: 'ui://x',
        mimeType: UI_MIME_TYPE,
        text: 'a',
        _meta: { ui: { csp: { connectDomains: 'not-array' } } },
      }).success,
    ).toBe(false);
  });

  it('buildUiResourceContents/buildUiResourceReadResult assemble the §26.4 wire shape', () => {
    const contents = buildUiResourceContents({
      uri: 'ui://get-time/mcp-app.html',
      text: '<!DOCTYPE html>',
      ui: { permissions: { clipboardWrite: {} }, prefersBorder: true },
    });
    expect(contents.mimeType).toBe(UI_MIME_TYPE);
    expect((contents as Record<string, unknown>)['_meta']).toEqual({
      ui: { permissions: { clipboardWrite: {} }, prefersBorder: true },
    });
    const result = buildUiResourceReadResult(contents, { ttlMs: 0, cacheScope: 'private' });
    expect(result.resultType).toBe('complete');
    expect(result.contents).toEqual([contents]);
    expect(result.ttlMs).toBe(0);
    expect(result.cacheScope).toBe('private');
  });

  it('buildUiResourceContents rejects non-ui:// uris and bad text/blob combos', () => {
    expect(() => buildUiResourceContents({ uri: 'https://x', text: 'a' })).toThrow(RangeError);
    expect(() => buildUiResourceContents({ uri: 'ui://x' })).toThrow(RangeError);
    expect(() => buildUiResourceContents({ uri: 'ui://x', text: 'a', blob: 'AAAA' })).toThrow(RangeError);
    expect(() => buildUiResourceReadResult(
      buildUiResourceContents({ uri: 'ui://x', text: 'a' }),
      { ttlMs: -1, cacheScope: 'private' },
    )).toThrow(RangeError);
  });
});

// ─── §26.4 CSP hints (AC-41.34 .. AC-41.36) ─────────────────────────────────────

describe('§26.4 resource hints: CSP', () => {
  it('AC-41.34: csp members enumerate connect/resource/frame/baseUri origins', () => {
    expect(UI_CSP_DIRECTIVES).toEqual(['connectDomains', 'resourceDomains', 'frameDomains', 'baseUriDomains']);
    const csp = {
      connectDomains: ['https://c'],
      resourceDomains: ['https://r'],
      frameDomains: ['https://f'],
      baseUriDomains: ['https://b'],
    };
    expect(UiContentSecurityPolicySchema.safeParse(csp).success).toBe(true);
    expect(cspAllowsOrigin(csp, 'connectDomains', 'https://c')).toBe(true);
    expect(cspAllowsOrigin(csp, 'resourceDomains', 'https://r')).toBe(true);
    expect(cspAllowsOrigin(csp, 'frameDomains', 'https://f')).toBe(true);
    expect(cspAllowsOrigin(csp, 'baseUriDomains', 'https://b')).toBe(true);
  });

  it('AC-41.35: an origin not listed in the applicable member is blocked', () => {
    const csp = { connectDomains: ['https://allowed'] };
    expect(cspAllowsOrigin(csp, 'connectDomains', 'https://evil')).toBe(false);
    // Listed in connect but not in resource => blocked for resource loads.
    expect(cspAllowsOrigin(csp, 'resourceDomains', 'https://allowed')).toBe(false);
  });

  it('AC-41.36: when csp is omitted the host applies a restrictive deny-by-default policy', () => {
    expect(resolveCsp(undefined)).toBe(DENY_BY_DEFAULT_CSP);
    expect(DENY_BY_DEFAULT_CSP.connectDomains).toEqual([]);
    // Deny-by-default blocks every origin in every directive.
    for (const directive of UI_CSP_DIRECTIVES) {
      expect(cspAllowsOrigin(undefined, directive, 'https://anything')).toBe(false);
    }
    // A present csp is returned as-is (host constrains its policy by it).
    const csp = { connectDomains: ['https://x'] };
    expect(resolveCsp(csp)).toBe(csp);
  });
});

// ─── §26.4 permissions/domain/border (AC-41.37 .. AC-41.41) ─────────────────────

describe('§26.4 resource hints: permissions, domain, border', () => {
  it('AC-41.37: each permission member is one of the four names with an empty-object value', () => {
    expect(UI_PERMISSION_NAMES).toEqual(['camera', 'microphone', 'geolocation', 'clipboardWrite']);
    const perms = { camera: {}, clipboardWrite: {} };
    expect(UiPermissionsSchema.safeParse(perms).success).toBe(true);
    expect(permissionRequested(perms, 'camera')).toBe(true);
    expect(permissionRequested(perms, 'clipboardWrite')).toBe(true);
    expect(requestedPermissions(perms)).toEqual(['camera', 'clipboardWrite']);
  });

  it('AC-41.38: a capability not present in permissions is not granted', () => {
    const perms = { camera: {} };
    expect(permissionRequested(perms, 'microphone')).toBe(false);
    expect(mayGrantPermission(perms, 'microphone')).toBe(false); // never grant unrequested
    expect(mayGrantPermission(undefined, 'camera')).toBe(false);
    expect(requestedPermissions(undefined)).toEqual([]);
  });

  it('AC-41.39: the host MAY decline a requested capability', () => {
    const perms = { camera: {} };
    expect(mayGrantPermission(perms, 'camera')).toBe(true); // requested, host grants
    expect(mayGrantPermission(perms, 'camera', /* hostDeclines */ true)).toBe(false); // host declines
  });

  it('AC-41.40: domain is an optional dedicated origin to render under', () => {
    const meta = { domain: 'https://ui-1.example' };
    expect(ResourceUiMetaSchema.safeParse(meta).success).toBe(true);
    expect(ResourceUiMetaSchema.parse(meta).domain).toBe('https://ui-1.example');
  });

  it('AC-41.41: prefersBorder is an optional boolean the host MAY honor or ignore', () => {
    expect(ResourceUiMetaSchema.safeParse({ prefersBorder: true }).success).toBe(true);
    expect(ResourceUiMetaSchema.safeParse({ prefersBorder: 'yes' }).success).toBe(false);
    expect(isResourceUiMeta({ csp: {}, permissions: {}, domain: 'x', prefersBorder: false })).toBe(true);
  });
});

// ─── §26.4 rendering isolation (AC-41.42 .. AC-41.44) ───────────────────────────

describe('§26.4 rendering isolation (host obligations, declarative)', () => {
  it('AC-41.42: rendering in a sandboxed, isolated browsing context is a host MUST', () => {
    // Modeled as a host responsibility the SDK assigns; the server SDK does not
    // render, so there is nothing to sandbox at this layer.
    expect(uiResponsibilityOwner('sandbox')).toBe('host');
    expect(isServerResponsibility('sandbox')).toBe(false);
  });

  it('AC-41.43: applying a restrictive CSP constrained by the declared descriptor is a host MUST', () => {
    expect(uiResponsibilityOwner('enforce-csp')).toBe('host');
    // "constrained by the declared csp": resolveCsp returns the declared descriptor
    // (the host narrows its policy to it), or deny-by-default when omitted.
    const declared = { connectDomains: ['https://x'] };
    expect(resolveCsp(declared)).toBe(declared);
    expect(resolveCsp(undefined)).toBe(DENY_BY_DEFAULT_CSP);
  });

  it('AC-41.44: rendered content gets no ambient host access; the channel is the only link (host MUST NOT)', () => {
    // The only sanctioned link is the §26.5 channel — itself a host responsibility
    // (run-channel); the server SDK grants no ambient access of any kind.
    expect(uiResponsibilityOwner('run-channel')).toBe('host');
    expect(uiResponsibilityOwner('mediate-consent')).toBe('host');
  });
});
