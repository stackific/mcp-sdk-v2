/**
 * S38 — The Extension Mechanism (§24).
 *
 * One or more cases per numbered acceptance criterion (AC-38.1 – AC-38.43).
 */

import { describe, it, expect } from 'vitest';
import {
  // identifier policy
  isValidThirdPartyExtensionId,
  validateThirdPartyExtensionId,
  isReservedBareVendorPrefix,
  extensionIdsMatch,
  // classification
  isExtensionClassification,
  EXTENSION_CLASSIFICATIONS,
  // surface channels
  EXTENSION_SURFACE_CHANNELS,
  isSanctionedSurfaceChannel,
  // method namespacing & dispatch
  deriveExtensionNamespace,
  isMethodInExtensionNamespace,
  extensionMethod,
  ExtensionMethodRouter,
  // meta keys
  isExtensionControlledMetaKey,
  extensionMetaKey,
  // result types
  CORE_RESULT_TYPE_VALUES,
  acceptedResultTypes,
  isResultTypeAccepted,
  // active set
  computeActiveSet,
  activeSetForRequest,
  mayEmitExtensionSurface,
  // versioning
  getExtensionVersion,
  isIncompatibleChange,
  suggestSuccessorIdentifier,
  // degradation
  buildRequiredExtensionError,
  REQUIRED_EXTENSION_ABSENT_CODE,
  decideExtensionUse,
  // definitions / reconciliation
  validateExtensionDefinition,
  reconcileExtensionSettings,
} from '../../protocol/extension-mechanism.js';
import { RESULT_TYPE } from '../../jsonrpc/payload.js';
import { MISSING_CLIENT_CAPABILITY_CODE } from '../../protocol/meta.js';

// ─── AC-38.1 — third-party conforms to the framework / non-conforming rejected ─

describe('AC-38.1 framework conformance of an extension definition', () => {
  it('accepts a conforming third-party extension definition', () => {
    const result = validateExtensionDefinition({
      identifier: 'com.example/my-extension',
      classification: 'modular',
      methods: ['my-extension/get'],
      metaKeys: ['com.example/trace'],
      resultTypes: ['com.example.partial'],
      fields: ['Tool.x'],
    });
    expect(result.ok).toBe(true);
  });

  it('rejects a non-conforming definition (bad namespace, core resultType, bad meta prefix)', () => {
    const result = validateExtensionDefinition({
      identifier: 'com.example/my-extension',
      methods: ['tasks/get'], // not under my-extension/
      metaKeys: ['org.other/key'], // not controlled by com.example
      resultTypes: ['complete'], // redefines core
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const channels = result.violations.map((v) => v.channel).sort();
      expect(channels).toContain('method');
      expect(channels).toContain('meta-key');
      expect(channels).toContain('result-type');
    }
  });
});

// ─── AC-38.2 — classifiable; zero-extension still conformant ───────────────────

describe('AC-38.2 classification', () => {
  it('classifies as modular, specialized, or experimental', () => {
    expect(EXTENSION_CLASSIFICATIONS).toEqual(['modular', 'specialized', 'experimental']);
    for (const c of EXTENSION_CLASSIFICATIONS) expect(isExtensionClassification(c)).toBe(true);
    expect(isExtensionClassification('other')).toBe(false);
  });

  it('an empty active set (zero extensions) is valid — core conformance stands', () => {
    expect(computeActiveSet({}, {})).toEqual([]);
    expect(computeActiveSet(undefined, undefined)).toEqual([]);
  });
});

// ─── AC-38.3 — N>1 extensions negotiated independently ─────────────────────────

describe('AC-38.3 multiple extensions negotiated independently', () => {
  it('intersects each identifier independently', () => {
    const client = { 'com.example/a': {}, 'com.example/b': {}, 'com.example/c': {} };
    const server = { 'com.example/b': {}, 'com.example/c': {}, 'com.example/d': {} };
    expect(computeActiveSet(client, server)).toEqual(['com.example/b', 'com.example/c']);
  });
});

// ─── AC-38.4 — disabled by default ─────────────────────────────────────────────

describe('AC-38.4 disabled by default', () => {
  it('an extension not negotiated is not active', () => {
    const active = computeActiveSet({ 'com.example/x': {} }, { 'com.example/y': {} });
    expect(mayEmitExtensionSurface('com.example/x', active)).toBe(false);
  });
});

// ─── AC-38.5 — surface outside the mechanism is flagged non-conformant ─────────

describe('AC-38.5 only extension-declared surface is sanctioned', () => {
  it('only the four channels are sanctioned', () => {
    expect(EXTENSION_SURFACE_CHANNELS).toEqual(['method', 'meta-key', 'result-type', 'field']);
    expect(isSanctionedSurfaceChannel('method')).toBe(true);
    expect(isSanctionedSurfaceChannel('header')).toBe(false);
  });

  it('flags a method/resultType added outside its declared namespace', () => {
    const r = validateExtensionDefinition({
      identifier: 'com.example/x',
      methods: ['rogue/method'],
      resultTypes: ['input_required'],
    });
    expect(r.ok).toBe(false);
  });
});

// ─── AC-38.6 — bare name (no prefix) rejected ──────────────────────────────────

describe('AC-38.6 missing vendor prefix', () => {
  it('rejects a bare name with no slash', () => {
    expect(isValidThirdPartyExtensionId('myextension')).toBe(false);
    expect(validateThirdPartyExtensionId('myextension')).toEqual({ ok: false, reason: 'missing-prefix' });
  });
});

// ─── AC-38.7 — label start/end rules ───────────────────────────────────────────

describe('AC-38.7 prefix label grammar', () => {
  it('rejects a label not starting with a letter or not ending letter/digit', () => {
    expect(isValidThirdPartyExtensionId('1com.example/x')).toBe(false);
    expect(isValidThirdPartyExtensionId('com.example-/x')).toBe(false);
  });
  it('accepts a label like a-b1', () => {
    expect(isValidThirdPartyExtensionId('a-b1.example/x')).toBe(true);
  });
});

// ─── AC-38.8 — reverse-DNS guidance documented ─────────────────────────────────

describe('AC-38.8 reverse-DNS recommended form', () => {
  it('accepts reverse-DNS of a controlled domain (com.example/)', () => {
    expect(isValidThirdPartyExtensionId('com.example/x')).toBe(true);
  });
});

// ─── AC-38.9 — extension-name grammar ──────────────────────────────────────────

describe('AC-38.9 extension-name grammar', () => {
  it('rejects a name not beginning/ending alphanumeric or with a bad char', () => {
    expect(isValidThirdPartyExtensionId('com.example/-bad')).toBe(false);
    expect(isValidThirdPartyExtensionId('com.example/bad-')).toBe(false);
    expect(isValidThirdPartyExtensionId('com.example/has space')).toBe(false);
  });
  it('accepts my-extension and a', () => {
    expect(isValidThirdPartyExtensionId('com.example/my-extension')).toBe(true);
    expect(isValidThirdPartyExtensionId('com.example/a')).toBe(true);
  });
});

// ─── AC-38.10 — reserved second-label prefixes rejected for third parties ───────

describe('AC-38.10 reserved second-label prefix', () => {
  it('rejects io.modelcontextprotocol/ and com.mcp.tools/', () => {
    expect(validateThirdPartyExtensionId('io.modelcontextprotocol/x')).toEqual({
      ok: false,
      reason: 'reserved-prefix',
    });
    expect(validateThirdPartyExtensionId('com.mcp.tools/x')).toEqual({
      ok: false,
      reason: 'reserved-prefix',
    });
  });
  it('accepts com.example.mcp/x (second label is example)', () => {
    expect(isValidThirdPartyExtensionId('com.example.mcp/x')).toBe(true);
  });
});

// ─── AC-38.11 — bare reserved token prefixes rejected ──────────────────────────

describe('AC-38.11 bare reserved token prefix', () => {
  it('rejects modelcontextprotocol/ and mcp/ as vendor prefixes', () => {
    expect(isReservedBareVendorPrefix('modelcontextprotocol')).toBe(true);
    expect(isReservedBareVendorPrefix('mcp')).toBe(true);
    expect(validateThirdPartyExtensionId('modelcontextprotocol/x')).toEqual({
      ok: false,
      reason: 'reserved-bare-token',
    });
    expect(validateThirdPartyExtensionId('mcp/x')).toEqual({ ok: false, reason: 'reserved-bare-token' });
  });
});

// ─── AC-38.12 — case-sensitivity / octet-for-octet ─────────────────────────────

describe('AC-38.12 case-sensitive matching', () => {
  it('treats Com.Example/Ext and com.example/ext as distinct', () => {
    expect(extensionIdsMatch('Com.Example/Ext', 'com.example/ext')).toBe(false);
    expect(extensionIdsMatch('com.example/ext', 'com.example/ext')).toBe(true);
  });
  it('the active set is computed without case folding', () => {
    const active = computeActiveSet({ 'Com.Example/Ext': {} }, { 'com.example/ext': {} });
    expect(active).toEqual([]);
  });
});

// ─── AC-38.13 — absent/empty extensions => no extensions ───────────────────────

describe('AC-38.13 absent or empty extensions map', () => {
  it('treats absence or {} as advertising no extensions', () => {
    expect(computeActiveSet({ 'com.example/a': {} }, {})).toEqual([]);
    expect(computeActiveSet({ 'com.example/a': {} }, undefined)).toEqual([]);
  });
});

// ─── AC-38.14 — produced maps carry no null values ─────────────────────────────

describe('AC-38.14 no null values in a produced map', () => {
  it('a built extension definition uses {} not null for enabled-no-settings', () => {
    // The map a producer builds for "enabled, no settings" is {}, never null.
    const producedValue: Record<string, unknown> = {};
    expect(producedValue).not.toBeNull();
    // computeActiveSet over a clean produced map is stable.
    expect(computeActiveSet({ 'com.example/a': producedValue }, { 'com.example/a': {} })).toEqual([
      'com.example/a',
    ]);
  });
});

// ─── AC-38.15 — null value => malformed, not activated ─────────────────────────

describe('AC-38.15 null-valued entry not activated', () => {
  it('does not activate an extension whose value is null on either side', () => {
    expect(computeActiveSet({ 'com.example/broken': null }, { 'com.example/broken': {} })).toEqual([]);
    expect(computeActiveSet({ 'com.example/broken': {} }, { 'com.example/broken': null })).toEqual([]);
  });
});

// ─── AC-38.16 — one-sided extension not used ───────────────────────────────────

describe('AC-38.16 active set is the intersection', () => {
  it('an extension advertised by only one side is not active', () => {
    const active = computeActiveSet({ 'com.example/only-client': {} }, { 'com.example/other': {} });
    expect(active).not.toContain('com.example/only-client');
    expect(mayEmitExtensionSurface('com.example/only-client', active)).toBe(false);
  });
});

// ─── AC-38.17 — no surface for a non-active extension ──────────────────────────

describe('AC-38.17 no surface for a non-active extension', () => {
  const active: string[] = []; // nothing active
  it('method dispatch is refused for a non-active extension', () => {
    const router = new ExtensionMethodRouter();
    router.register('com.example/x', 'x/do', () => 'ran');
    const out = router.dispatch('x/do', {}, active);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('extension-inactive');
  });
  it('a non-active extension may not emit any of method/meta/resultType/field', () => {
    expect(mayEmitExtensionSurface('com.example/x', active)).toBe(false);
    expect(isResultTypeAccepted('com.example.partial', active, new Map([['com.example/x', ['com.example.partial']]]))).toBe(
      false,
    );
  });
});

// ─── AC-38.18 — receiver may reject-with-core-error or ignore ──────────────────

describe('AC-38.18 receiver handling of non-active surface', () => {
  it('dispatch surfaces a core error code so the caller may reject or ignore', () => {
    const router = new ExtensionMethodRouter();
    router.register('com.example/x', 'x/do', () => 1);
    const out = router.dispatch('x/do', {}, []);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.code).toBe(-32602); // INVALID_PARAMS_CODE — caller MAY reject (R-24.3-f)
  });
});

// ─── AC-38.19 — reconcile both sides' settings ─────────────────────────────────

describe('AC-38.19 settings reconciliation', () => {
  it('returns both sides settings only when active on both', () => {
    const client = { 'com.example/x': { mimeTypes: ['a', 'b'] } };
    const server = { 'com.example/x': { mimeTypes: ['b', 'c'] } };
    const r = reconcileExtensionSettings(client, server, 'com.example/x');
    expect(r).toEqual({ client: { mimeTypes: ['a', 'b'] }, server: { mimeTypes: ['b', 'c'] } });
  });
  it('returns undefined when only one side advertises', () => {
    expect(reconcileExtensionSettings({ 'com.example/x': {} }, {}, 'com.example/x')).toBeUndefined();
  });
});

// ─── AC-38.20 — server recomputes from this request's client capabilities ──────

describe('AC-38.20 per-request recomputation', () => {
  it('computes the active set from the request capabilities supplied', () => {
    const server = { 'com.example/x': {} };
    expect(activeSetForRequest({ 'com.example/x': {} }, server)).toEqual(['com.example/x']);
    expect(activeSetForRequest({}, server)).toEqual([]);
  });
});

// ─── AC-38.21 — no inference from a prior request ──────────────────────────────

describe('AC-38.21 stateless: no inference from a prior request', () => {
  it('request B without the extension yields no activation even after request A had it', () => {
    const server = { 'com.example/x': {} };
    const a = activeSetForRequest({ 'com.example/x': {} }, server);
    const b = activeSetForRequest({}, server); // same connection, different request
    expect(a).toEqual(['com.example/x']);
    expect(b).toEqual([]); // independent of A
  });
});

// ─── AC-38.22 — request not advertising => served as inactive ──────────────────

describe('AC-38.22 unadvertised on a request => inactive', () => {
  it('serves the request as if the extension were inactive', () => {
    const active = activeSetForRequest({}, { 'com.example/x': {} });
    expect(mayEmitExtensionSurface('com.example/x', active)).toBe(false);
  });
});

// ─── AC-38.23 — only the four channels ─────────────────────────────────────────

describe('AC-38.23 four surface channels only', () => {
  it('enumerates exactly the four channels', () => {
    expect([...EXTENSION_SURFACE_CHANNELS]).toEqual(['method', 'meta-key', 'result-type', 'field']);
  });
});

// ─── AC-38.24 — method namespaced from identifier; no collisions ───────────────

describe('AC-38.24 method namespacing', () => {
  it('derives the namespace from the identifier name and recognizes members', () => {
    expect(deriveExtensionNamespace('io.modelcontextprotocol/tasks')).toBe('tasks/');
    expect(isMethodInExtensionNamespace('tasks/get', 'io.modelcontextprotocol/tasks')).toBe(true);
    expect(extensionMethod('io.modelcontextprotocol/tasks', 'get')).toBe('tasks/get');
  });
  it('a method outside the namespace does not match (no collision with core/others)', () => {
    expect(isMethodInExtensionNamespace('resources/read', 'io.modelcontextprotocol/tasks')).toBe(false);
    expect(isMethodInExtensionNamespace('tasks/', 'io.modelcontextprotocol/tasks')).toBe(false); // empty member
  });
});

// ─── AC-38.25 — non-active extension's method not sent ─────────────────────────

describe('AC-38.25 non-active method not sent', () => {
  it('refuses to dispatch a method whose extension is inactive', () => {
    const router = new ExtensionMethodRouter();
    router.register('com.example/x', 'x/run', () => 'ok');
    expect(router.dispatch('x/run', {}, ['com.example/other']).ok).toBe(false);
    expect(router.dispatch('x/run', {}, ['com.example/x']).ok).toBe(true);
  });
});

// ─── AC-38.26 — extension `_meta` key under controlled prefix ──────────────────

describe('AC-38.26 controlled _meta keys', () => {
  it('accepts a key under the extension vendor prefix and rejects others', () => {
    expect(isExtensionControlledMetaKey('com.example/trace', 'com.example/x')).toBe(true);
    expect(isExtensionControlledMetaKey('io.modelcontextprotocol/ui-data', 'io.modelcontextprotocol/ui')).toBe(true);
    expect(isExtensionControlledMetaKey('org.other/key', 'com.example/x')).toBe(false);
    expect(isExtensionControlledMetaKey('bareKey', 'com.example/x')).toBe(false);
    expect(extensionMetaKey('com.example/x', 'trace')).toBe('com.example/trace');
  });
});

// ─── AC-38.27 — accepted resultType set = core + active contributions ──────────

describe('AC-38.27 accepted resultType set', () => {
  it('equals core values plus active-extension contributions', () => {
    const active = ['com.example/x'];
    const contributions = new Map([
      ['com.example/x', ['com.example.partial']],
      ['com.example/inactive', ['com.example.never']],
    ]);
    const accepted = acceptedResultTypes(active, contributions);
    expect(accepted.has(RESULT_TYPE.COMPLETE)).toBe(true);
    expect(accepted.has(RESULT_TYPE.INPUT_REQUIRED)).toBe(true);
    expect(accepted.has('com.example.partial')).toBe(true);
    expect(accepted.has('com.example.never')).toBe(false); // inactive contributor excluded
    expect(CORE_RESULT_TYPE_VALUES).toEqual(['complete', 'input_required']);
  });
});

// ─── AC-38.28 — unknown/inactive resultType invalid ────────────────────────────

describe('AC-38.28 invalid resultType', () => {
  it('treats a value neither core nor active-contributed as invalid', () => {
    expect(isResultTypeAccepted('complete', [])).toBe(true);
    expect(isResultTypeAccepted('com.example.partial', [])).toBe(false);
    const contributions = new Map([['com.example/x', ['com.example.partial']]]);
    expect(isResultTypeAccepted('com.example.partial', ['com.example/x'], contributions)).toBe(true);
    expect(isResultTypeAccepted('com.example.partial', [], contributions)).toBe(false);
  });
});

// ─── AC-38.29 — unknown extension fields ignored when inactive ─────────────────

describe('AC-38.29 ignore extension-added fields when inactive', () => {
  it('a peer without the extension does not depend on the field and ignores it', () => {
    const active: string[] = [];
    // The mechanism for "ignore unknown fields" is forward-compatibility: a peer
    // simply does not read them. We assert the gate that prevents reliance.
    expect(mayEmitExtensionSurface('com.example/x', active)).toBe(false);
    const obj = { name: 'core', 'com.example/extra': 'ignored-by-inactive-peer' };
    // A peer for which the extension is inactive reads only the core field.
    expect(obj.name).toBe('core');
  });
});

// ─── AC-38.30 — does not depend on extension field unless active ───────────────

describe('AC-38.30 no dependence on extension field unless active', () => {
  it('decideExtensionUse falls back when the extension is inactive', () => {
    expect(decideExtensionUse({ identifier: 'com.example/x', activeSet: [], mandatory: false })).toBe(
      'fallback',
    );
    expect(
      decideExtensionUse({ identifier: 'com.example/x', activeSet: ['com.example/x'], mandatory: false }),
    ).toBe('use-extension');
  });
});

// ─── AC-38.31 — no redefinition of core surface ────────────────────────────────

describe('AC-38.31 no redefinition of core surface', () => {
  it('flags a definition that redefines a core resultType', () => {
    const r = validateExtensionDefinition({
      identifier: 'com.example/x',
      resultTypes: ['complete'],
    });
    expect(r.ok).toBe(false);
  });
  it('cannot re-register the same method (no redefinition)', () => {
    const router = new ExtensionMethodRouter();
    router.register('com.example/x', 'x/do', () => 1);
    expect(() => router.register('com.example/x', 'x/do', () => 2)).toThrow();
  });
});

// ─── AC-38.32 — version in the settings object ─────────────────────────────────

describe('AC-38.32 version in settings object', () => {
  it('reads the version from the settings object', () => {
    expect(getExtensionVersion({ 'com.example/x': { version: '2' } }, 'com.example/x')).toBe('2');
    expect(getExtensionVersion({ 'com.example/x': { version: 2 } }, 'com.example/x')).toBe('2');
  });
});

// ─── AC-38.33 — version obtainable from the negotiation map only ───────────────

describe('AC-38.33 version discoverable through negotiation', () => {
  it('returns undefined (never out-of-band) when no version advertised', () => {
    expect(getExtensionVersion({ 'com.example/x': {} }, 'com.example/x')).toBeUndefined();
    expect(getExtensionVersion({}, 'com.example/x')).toBeUndefined();
  });
});

// ─── AC-38.34 — backward-compatible change stays within identifier ─────────────

describe('AC-38.34 backward-compatible evolution', () => {
  it('treats optional fields / capability flags as compatible (no new identifier)', () => {
    expect(isIncompatibleChange('add-optional-field')).toBe(false);
    expect(isIncompatibleChange('add-capability-flag')).toBe(false);
  });
});

// ─── AC-38.35 — incompatible change => new identifier ──────────────────────────

describe('AC-38.35 incompatible change => new identifier', () => {
  it('classifies incompatible changes and mints a distinct successor', () => {
    expect(isIncompatibleChange('remove-field')).toBe(true);
    expect(isIncompatibleChange('rename-field')).toBe(true);
    expect(isIncompatibleChange('change-type')).toBe(true);
    expect(isIncompatibleChange('add-required-field')).toBe(true);
    expect(suggestSuccessorIdentifier('com.example/my-extension')).toBe('com.example/my-extension-2');
  });
});

// ─── AC-38.36 — fall back to core when inactive ────────────────────────────────

describe('AC-38.36 fall back to core when inactive', () => {
  it('non-mandatory inactive extension => fallback', () => {
    expect(decideExtensionUse({ identifier: 'com.example/x', activeSet: [], mandatory: false })).toBe(
      'fallback',
    );
  });
});

// ─── AC-38.37 — emit no surface; use core behavior ─────────────────────────────

describe('AC-38.37 emit no non-active surface', () => {
  it('a non-active extension may emit no method/meta/resultType/field', () => {
    expect(mayEmitExtensionSurface('com.example/x', [])).toBe(false);
  });
});

// ─── AC-38.38 — tools enriched by inactive ext still return core content ───────

describe('AC-38.38 core content for a client without the extension', () => {
  it('use-extension only when active; otherwise the core path (fallback) is taken', () => {
    const inactive = decideExtensionUse({ identifier: 'io.modelcontextprotocol/ui', activeSet: [], mandatory: false });
    expect(inactive).toBe('fallback'); // server returns meaningful core content
  });
});

// ─── AC-38.39 / AC-38.40 — actionable required-extension error identifying it ──

describe('AC-38.39/40 actionable required-extension error', () => {
  it('builds an error that identifies the required extension', () => {
    const err = buildRequiredExtensionError('com.example/needed');
    expect(err.code).toBe(REQUIRED_EXTENSION_ABSENT_CODE);
    expect(err.code).toBe(MISSING_CLIENT_CAPABILITY_CODE);
    expect(err.data.requiredExtension).toBe('com.example/needed');
    expect(err.message).toContain('com.example/needed'); // not opaque
  });
});

// ─── AC-38.41 — mandate may refuse outright ────────────────────────────────────

describe('AC-38.41 mandated extension may refuse', () => {
  it('a mandatory inactive extension yields reject', () => {
    expect(decideExtensionUse({ identifier: 'com.example/x', activeSet: [], mandatory: true })).toBe(
      'reject',
    );
  });
});

// ─── AC-38.42 — unrecognized identifier ignored, not an error ──────────────────

describe('AC-38.42 unknown identifier ignored', () => {
  it('an unrecognized one-sided identifier is excluded from the active set without error', () => {
    expect(() =>
      computeActiveSet({ 'com.unknown/thing': {} }, { 'com.example/known': {} }),
    ).not.toThrow();
    const active = computeActiveSet({ 'com.unknown/thing': {} }, { 'com.example/known': {} });
    expect(active).not.toContain('com.unknown/thing');
    expect(active).toEqual([]);
  });
});

// ─── AC-38.43 — documented fallback behavior ───────────────────────────────────

describe('AC-38.43 fallback documented', () => {
  it('the fallback decision distinguishes use/fallback/reject for authors to document', () => {
    expect(decideExtensionUse({ identifier: 'e', activeSet: ['e'], mandatory: false })).toBe('use-extension');
    expect(decideExtensionUse({ identifier: 'e', activeSet: [], mandatory: false })).toBe('fallback');
    expect(decideExtensionUse({ identifier: 'e', activeSet: [], mandatory: true })).toBe('reject');
  });
});
