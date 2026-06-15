/**
 * Tests for S11 — The Extensions Map & Forward Compatibility (§6.5–§6.7).
 *
 * AC coverage:
 *  AC-11.1  (R-6.5-a) — identifier with no prefix is malformed
 *  AC-11.2  (R-6.5-b) — prefix label start/end character rules
 *  AC-11.3  (R-6.5-c) — interior hyphen in a prefix label is allowed
 *  AC-11.4  (R-6.5-d) — reverse-DNS prefix is well-formed (recommended)
 *  AC-11.5  (R-6.5-e) — name start/end alphanumeric; empty name allowed
 *  AC-11.6  (R-6.5-f) — name interior hyphen/underscore/dot/alnum allowed
 *  AC-11.7  (R-6.5-g) — reserved second label (modelcontextprotocol/mcp)
 *  AC-11.8  (R-6.5-h) — `{}` value means enabled-no-settings, not absent
 *  AC-11.9  (R-6.5-i) — producer map has no `null` values
 *  AC-11.10 (R-6.5-j) — `null` entry is malformed → ignored / not advertised
 *  AC-11.11 (R-6.5-k) — unknown settings keys ignored by the extension
 *  AC-11.12 (R-6.5-l) — active only in the intersection; no unilateral use
 *  AC-11.13 (R-6.5-m) — disabled by default (not advertised unless enabled)
 *  AC-11.14 (R-6.5-n) — one-sided support → fallback or reject-if-mandatory
 *  AC-11.15 (R-6.6-a) — tolerate unknown fields/keys without failing
 *  AC-11.16 (R-6.6-b) — ignore unrecognized capability fields
 *  AC-11.17 (R-6.6-c) — unknown capability field does not cause rejection
 *  AC-11.18 (R-6.6-d) — unknown extension/experimental key ignored, not active
 *  AC-11.19 (R-6.6-e) — newer/unknown settings keys ignored (older receiver ok)
 *  AC-11.20 (R-6.6-f) — unknown capability/extension/setting is not an error
 *  AC-11.21 (R-6.6-g) — absent unknown field implies nothing about known support
 *  AC-11.22 (R-6.7-a) — §6.7 worked example: active only on mutual advertisement
 */

import { describe, it, expect } from 'vitest';
import {
  isValidExtensionPrefix,
  isValidExtensionName,
  parseExtensionId,
  isValidExtensionId,
  isReservedExtensionPrefix,
  isThirdPartyUsable,
  isExtensionSettings,
  ExtensionsMapSchema,
  isValidExtensionsMap,
  normalizeExtensionsMap,
  isExtensionAdvertised,
  getExtensionSettings,
  pickKnownSettings,
  intersectExtensions,
  isExtensionActive,
  decideExtensionFallback,
  KNOWN_CLIENT_CAPABILITY_FIELDS,
  KNOWN_SERVER_CAPABILITY_FIELDS,
  unknownCapabilityFields,
  ignoreUnknownCapabilityFields,
} from '../../protocol/extensions.js';

// ─── AC-11.1 (R-6.5-a): prefix is REQUIRED ─────────────────────────────────────

describe('AC-11.1 — a prefix is required (R-6.5-a)', () => {
  it('rejects an identifier with no prefix (e.g. /tasks)', () => {
    // The empty string before the slash is not a valid prefix.
    expect(isValidExtensionId('/tasks')).toBe(false);
  });

  it('rejects an identifier with no slash at all (no prefix/name separation)', () => {
    expect(parseExtensionId('tasks')).toBeUndefined();
    expect(isValidExtensionId('tasks')).toBe(false);
  });

  it('accepts an identifier that includes a prefix', () => {
    expect(isValidExtensionId('com.example/tasks')).toBe(true);
  });
});

// ─── AC-11.2 (R-6.5-b): prefix label start/end characters ──────────────────────

describe('AC-11.2 — prefix label start/end rules (R-6.5-b)', () => {
  it('rejects a label that does not start with a letter', () => {
    expect(isValidExtensionPrefix('1com')).toBe(false);
    expect(isValidExtensionId('1com/x')).toBe(false);
  });

  it('rejects a label that does not end with a letter or digit', () => {
    expect(isValidExtensionPrefix('com-')).toBe(false);
    expect(isValidExtensionId('com-/x')).toBe(false);
  });

  it('accepts a label whose first char is a letter and last is a letter', () => {
    expect(isValidExtensionPrefix('com')).toBe(true);
    expect(isValidExtensionId('com/x')).toBe(true);
  });

  it('accepts a label that ends in a digit', () => {
    expect(isValidExtensionPrefix('ipv6')).toBe(true);
  });

  it('accepts a single-letter label', () => {
    expect(isValidExtensionPrefix('a')).toBe(true);
  });
});

// ─── AC-11.3 (R-6.5-c): interior hyphen ────────────────────────────────────────

describe('AC-11.3 — interior hyphen in a prefix label (R-6.5-c)', () => {
  it('accepts a label with an interior hyphen', () => {
    expect(isValidExtensionPrefix('my-org')).toBe(true);
    expect(isValidExtensionId('my-org/ext')).toBe(true);
  });

  it('still rejects a leading or trailing hyphen', () => {
    expect(isValidExtensionPrefix('-org')).toBe(false);
    expect(isValidExtensionPrefix('org-')).toBe(false);
  });
});

// ─── AC-11.4 (R-6.5-d): reverse-DNS recommended ────────────────────────────────

describe('AC-11.4 — reverse-DNS notation is well-formed (R-6.5-d)', () => {
  it('accepts a reverse-DNS prefix with a hyphenated name', () => {
    expect(isValidExtensionPrefix('com.example')).toBe(true);
    expect(isValidExtensionId('com.example/my-extension')).toBe(true);
  });

  it('accepts multi-label reverse-DNS prefixes', () => {
    expect(isValidExtensionPrefix('org.example.api')).toBe(true);
    expect(isValidExtensionId('org.example.api/thing')).toBe(true);
  });
});

// ─── AC-11.5 (R-6.5-e): name start/end alphanumeric; empty allowed ─────────────

describe('AC-11.5 — name start/end and empty name (R-6.5-e)', () => {
  it('rejects a name that does not begin with an alphanumeric', () => {
    expect(isValidExtensionName('-tasks')).toBe(false);
    expect(isValidExtensionId('com.example/-tasks')).toBe(false);
  });

  it('rejects a name that does not end with an alphanumeric', () => {
    expect(isValidExtensionName('tasks-')).toBe(false);
    expect(isValidExtensionId('com.example/tasks-')).toBe(false);
  });

  it('accepts a name that begins and ends with an alphanumeric', () => {
    expect(isValidExtensionName('oauth-client-credentials')).toBe(true);
    expect(isValidExtensionId('io.modelcontextprotocol/oauth-client-credentials')).toBe(true);
  });

  it('permits an empty name after the slash', () => {
    expect(isValidExtensionName('')).toBe(true);
    expect(parseExtensionId('com.example/')).toEqual({ prefix: 'com.example', name: '' });
    expect(isValidExtensionId('com.example/')).toBe(true);
  });
});

// ─── AC-11.6 (R-6.5-f): name interior characters ───────────────────────────────

describe('AC-11.6 — name interior characters (R-6.5-f)', () => {
  it('accepts hyphens, underscores, dots, and alphanumerics in the interior', () => {
    expect(isValidExtensionName('oauth-client_credentials.v2')).toBe(true);
    expect(isValidExtensionId('com.example/oauth-client_credentials.v2')).toBe(true);
  });

  it('rejects a name with a forbidden interior character', () => {
    expect(isValidExtensionName('bad name')).toBe(false);
    // A second slash lands inside the name and makes it invalid.
    expect(isValidExtensionId('com.example/a/b')).toBe(false);
  });
});

// ─── AC-11.7 (R-6.5-g): reserved second label ──────────────────────────────────

describe('AC-11.7 — reserved prefixes by second label (R-6.5-g)', () => {
  it.each([
    'io.modelcontextprotocol/x',
    'dev.mcp/x',
    'org.modelcontextprotocol.api/x',
    'com.mcp/x',
  ])('treats %s as reserved (not third-party usable)', (id) => {
    const parsed = parseExtensionId(id)!;
    expect(isReservedExtensionPrefix(parsed.prefix)).toBe(true);
    expect(isThirdPartyUsable(id)).toBe(false);
    // Reserved identifiers are still WELL-FORMED.
    expect(isValidExtensionId(id)).toBe(true);
  });

  it('does NOT treat com.example.mcp as reserved (second label is example)', () => {
    const parsed = parseExtensionId('com.example.mcp/x')!;
    expect(isReservedExtensionPrefix(parsed.prefix)).toBe(false);
    expect(isThirdPartyUsable('com.example.mcp/x')).toBe(true);
  });

  it('does not treat a single-label prefix as reserved (no second label)', () => {
    // mcp as a single label has no second label, so the rule does not apply.
    expect(isReservedExtensionPrefix('mcp')).toBe(false);
  });
});

// ─── AC-11.8 (R-6.5-h): `{}` means enabled-no-settings ─────────────────────────

describe('AC-11.8 — empty object means enabled, not absent (R-6.5-h)', () => {
  const raw = { 'io.modelcontextprotocol/tasks': {} };

  it('treats an entry mapped to {} as advertised/enabled', () => {
    expect(isExtensionAdvertised(raw, 'io.modelcontextprotocol/tasks')).toBe(true);
    expect(getExtensionSettings(raw, 'io.modelcontextprotocol/tasks')).toEqual({});
  });

  it('retains the {} entry through normalization (not dropped as absence)', () => {
    expect(normalizeExtensionsMap(raw)).toEqual({ 'io.modelcontextprotocol/tasks': {} });
  });

  it('recognizes {} as a valid settings object', () => {
    expect(isExtensionSettings({})).toBe(true);
  });
});

// ─── AC-11.9 (R-6.5-i): producer map has no null values ────────────────────────

describe('AC-11.9 — producer map has no null values (R-6.5-i)', () => {
  it('accepts a producer map whose values are all objects', () => {
    const map = { 'com.example/a': {}, 'com.example/b': { setting: 1 } };
    expect(isValidExtensionsMap(map)).toBe(true);
    expect(ExtensionsMapSchema.safeParse(map).success).toBe(true);
  });

  it('rejects a producer map containing a null value', () => {
    const map = { 'com.example/a': null };
    expect(isValidExtensionsMap(map)).toBe(false);
    expect(ExtensionsMapSchema.safeParse(map).success).toBe(false);
  });
});

// ─── AC-11.10 (R-6.5-j): null entry malformed → ignored ────────────────────────

describe('AC-11.10 — null-valued entry is malformed and ignored (R-6.5-j)', () => {
  const raw = {
    'io.modelcontextprotocol/ui': { mimeTypes: ['text/html'] },
    'io.modelcontextprotocol/broken': null,
  };

  it('drops the null entry during normalization', () => {
    const normalized = normalizeExtensionsMap(raw);
    expect(Object.prototype.hasOwnProperty.call(normalized, 'io.modelcontextprotocol/broken')).toBe(false);
    expect(normalized).toEqual({ 'io.modelcontextprotocol/ui': { mimeTypes: ['text/html'] } });
  });

  it('treats a null-valued extension as not advertised', () => {
    expect(isExtensionAdvertised(raw, 'io.modelcontextprotocol/broken')).toBe(false);
    expect(getExtensionSettings(raw, 'io.modelcontextprotocol/broken')).toBeUndefined();
  });

  it('also ignores non-object (array/scalar) values as malformed', () => {
    const weird = { 'a/b': [], 'c/d': 42, 'e/f': 'x' };
    expect(normalizeExtensionsMap(weird)).toEqual({});
  });
});

// ─── AC-11.11 (R-6.5-k): unknown settings keys ignored ─────────────────────────

describe('AC-11.11 — unknown settings keys are ignored by the extension (R-6.5-k)', () => {
  it('projects settings to only the keys the extension defines', () => {
    const settings = { mimeTypes: ['text/html'], somethingElse: true, another: 1 };
    expect(pickKnownSettings(settings, ['mimeTypes'])).toEqual({ mimeTypes: ['text/html'] });
  });

  it('accepts a Set of known keys and drops the rest', () => {
    const settings = { a: 1, b: 2, c: 3 };
    expect(pickKnownSettings(settings, new Set(['a', 'c']))).toEqual({ a: 1, c: 3 });
  });
});

// ─── AC-11.12 (R-6.5-l): active only in the intersection ───────────────────────

describe('AC-11.12 — active only in the intersection (R-6.5-l)', () => {
  it('is not active when only the client advertises E', () => {
    const client = { 'com.example/E': {} };
    const server = {};
    expect(isExtensionActive('com.example/E', client, server)).toBe(false);
    expect(intersectExtensions(client, server)).toEqual([]);
  });

  it('is not active when only the server advertises E', () => {
    const client = {};
    const server = { 'com.example/E': {} };
    expect(isExtensionActive('com.example/E', client, server)).toBe(false);
  });

  it('is active only when both advertise the same identifier', () => {
    const client = { 'com.example/E': {}, 'com.example/onlyClient': {} };
    const server = { 'com.example/E': {}, 'com.example/onlyServer': {} };
    expect(isExtensionActive('com.example/E', client, server)).toBe(true);
    expect(intersectExtensions(client, server)).toEqual(['com.example/E']);
  });
});

// ─── AC-11.13 (R-6.5-m): disabled by default ───────────────────────────────────

describe('AC-11.13 — extensions are disabled by default (R-6.5-m)', () => {
  it('an empty extensions map advertises nothing', () => {
    expect(normalizeExtensionsMap({})).toEqual({});
    expect(isExtensionAdvertised({}, 'com.example/E')).toBe(false);
  });

  it('an absent (undefined) extensions map advertises nothing', () => {
    expect(normalizeExtensionsMap(undefined)).toEqual({});
    expect(isExtensionAdvertised(undefined, 'com.example/E')).toBe(false);
  });

  it('a not-enabled extension does not appear in the advertised map', () => {
    const advertised = { 'com.example/enabled': {} };
    expect(isExtensionAdvertised(advertised, 'com.example/enabled')).toBe(true);
    expect(isExtensionAdvertised(advertised, 'com.example/notEnabled')).toBe(false);
  });
});

// ─── AC-11.14 (R-6.5-n): one-sided support fallback ────────────────────────────

describe('AC-11.14 — one-sided support → fallback or reject-if-mandatory (R-6.5-n)', () => {
  it('uses the extension when active', () => {
    expect(decideExtensionFallback({ active: true, mandatory: false })).toBe('use-extension');
    expect(decideExtensionFallback({ active: true, mandatory: true })).toBe('use-extension');
  });

  it('falls back to core behavior when not active and not mandatory', () => {
    expect(decideExtensionFallback({ active: false, mandatory: false })).toBe('fallback');
  });

  it('rejects only when not active AND mandatory for the operation', () => {
    expect(decideExtensionFallback({ active: false, mandatory: true })).toBe('reject');
  });

  it('ties the decision to actual intersection state', () => {
    const client = { 'com.example/E': {} };
    const server = {};
    const active = isExtensionActive('com.example/E', client, server);
    expect(decideExtensionFallback({ active, mandatory: false })).toBe('fallback');
    expect(decideExtensionFallback({ active, mandatory: true })).toBe('reject');
  });
});

// ─── AC-11.15 (R-6.6-a): tolerate unknown fields/keys ──────────────────────────

describe('AC-11.15 — tolerate unrecognized fields and keys (R-6.6-a)', () => {
  it('does not throw while normalizing a map with unknown keys', () => {
    const raw = { 'com.other/unknown': {}, 'com.example/known': { x: 1 } };
    expect(() => normalizeExtensionsMap(raw)).not.toThrow();
    expect(normalizeExtensionsMap(raw)).toEqual(raw);
  });

  it('does not throw while reading a capability object with unknown fields', () => {
    const caps = { tools: { listChanged: true }, futureFeature: { anything: true } };
    expect(() => ignoreUnknownCapabilityFields(caps, KNOWN_SERVER_CAPABILITY_FIELDS)).not.toThrow();
  });
});

// ─── AC-11.16 (R-6.6-b): ignore unknown capability fields ──────────────────────

describe('AC-11.16 — ignore unrecognized capability fields (R-6.6-b)', () => {
  it('reports unknown fields and drops them from the acted-on view', () => {
    const caps = { tools: { listChanged: true }, futureFeature: { anything: true } };
    expect(unknownCapabilityFields(caps, KNOWN_SERVER_CAPABILITY_FIELDS)).toEqual(['futureFeature']);
    expect(ignoreUnknownCapabilityFields(caps, KNOWN_SERVER_CAPABILITY_FIELDS)).toEqual({
      tools: { listChanged: true },
    });
  });

  it('keeps all recognized client fields', () => {
    const caps = { elicitation: { form: {} }, mystery: 1 };
    expect(ignoreUnknownCapabilityFields(caps, KNOWN_CLIENT_CAPABILITY_FIELDS)).toEqual({
      elicitation: { form: {} },
    });
  });
});

// ─── AC-11.17 (R-6.6-c): unknown field does not cause rejection ────────────────

describe('AC-11.17 — unknown capability field does not cause rejection (R-6.6-c)', () => {
  it('an unknown field is reported but processing still yields a usable object', () => {
    const caps = { tools: { listChanged: true }, futureFeature: { anything: true } };
    const unknown = unknownCapabilityFields(caps, KNOWN_SERVER_CAPABILITY_FIELDS);
    // Presence of an unknown field is non-fatal: we still produce a recognized view.
    expect(unknown.length).toBeGreaterThan(0);
    const acted = ignoreUnknownCapabilityFields(caps, KNOWN_SERVER_CAPABILITY_FIELDS);
    expect(acted).toHaveProperty('tools');
  });
});

// ─── AC-11.18 (R-6.6-d): unknown extension key ignored, not active ─────────────

describe('AC-11.18 — unknown extension/experimental key ignored, not active (R-6.6-d)', () => {
  it('an extension only one peer recognizes is not in the intersection', () => {
    const client = { 'io.modelcontextprotocol/ui': {}, 'com.other/unknown': {} };
    const server = { 'io.modelcontextprotocol/ui': {} };
    // com.other/unknown is advertised by the client but not the server → not active.
    expect(intersectExtensions(client, server)).toEqual(['io.modelcontextprotocol/ui']);
    expect(isExtensionActive('com.other/unknown', client, server)).toBe(false);
  });

  it('applies the same ignore rule shape to an experimental map (record of records)', () => {
    // The experimental map shares the ignore-unknown-key rule; an unrecognized
    // identifier maps to a settings object that the receiver simply does not act on.
    const experimental = { 'com.other/unknown': { foo: 1 } };
    const recognized = new Set<string>(); // receiver recognizes none of them
    const acted = ignoreUnknownCapabilityFields(experimental, recognized);
    expect(acted).toEqual({});
  });
});

// ─── AC-11.19 (R-6.6-e): newer settings keys ignored ───────────────────────────

describe('AC-11.19 — newer/unknown settings keys ignored (R-6.6-e)', () => {
  it('an older receiver keeps working by dropping settings keys it does not know', () => {
    const settings = { mimeTypes: ['text/html;profile=mcp-app'], unknownSetting: 42 };
    // Older receiver only knows mimeTypes.
    expect(pickKnownSettings(settings, ['mimeTypes'])).toEqual({
      mimeTypes: ['text/html;profile=mcp-app'],
    });
  });
});

// ─── AC-11.20 (R-6.6-f): unknown things are not errors ─────────────────────────

describe('AC-11.20 — unknown capability/extension/setting is not an error (R-6.6-f)', () => {
  it('normalizing a map with an unknown extension does not error and keeps it for intersection', () => {
    const raw = { 'com.other/unknown': {} };
    expect(() => normalizeExtensionsMap(raw)).not.toThrow();
    expect(normalizeExtensionsMap(raw)).toEqual(raw);
  });

  it('reading unknown capability fields does not throw', () => {
    const caps = { unknownA: 1, unknownB: 2 };
    expect(() => unknownCapabilityFields(caps, KNOWN_SERVER_CAPABILITY_FIELDS)).not.toThrow();
    expect(unknownCapabilityFields(caps, KNOWN_SERVER_CAPABILITY_FIELDS)).toEqual(['unknownA', 'unknownB']);
  });

  it('picking known settings from an all-unknown object yields {} without error', () => {
    expect(() => pickKnownSettings({ x: 1 }, ['mimeTypes'])).not.toThrow();
    expect(pickKnownSettings({ x: 1 }, ['mimeTypes'])).toEqual({});
  });
});

// ─── AC-11.21 (R-6.6-g): absence of unknown field implies nothing ──────────────

describe('AC-11.21 — absence of an unknown field implies nothing about known support (R-6.6-g)', () => {
  it('dropping unknown fields leaves recognized capabilities untouched', () => {
    const withUnknown = { tools: { listChanged: true }, futureFeature: { x: true } };
    const withoutUnknown = { tools: { listChanged: true } };
    // Whether or not the unknown field is present, the recognized view is identical,
    // so a receiver cannot infer (non-)support of `tools` from the unknown field.
    expect(ignoreUnknownCapabilityFields(withUnknown, KNOWN_SERVER_CAPABILITY_FIELDS)).toEqual(
      ignoreUnknownCapabilityFields(withoutUnknown, KNOWN_SERVER_CAPABILITY_FIELDS),
    );
  });

  it('an unrecognized extension being present/absent does not change the active set', () => {
    const client = { 'io.modelcontextprotocol/ui': {} };
    const serverWith = { 'io.modelcontextprotocol/ui': {}, 'com.other/unknown': {} };
    const serverWithout = { 'io.modelcontextprotocol/ui': {} };
    expect(intersectExtensions(client, serverWith)).toEqual(intersectExtensions(client, serverWithout));
  });
});

// ─── AC-11.22 (R-6.7-a): §6.7 worked example ───────────────────────────────────

describe('AC-11.22 — §6.7 worked example: active only on mutual advertisement (R-6.7-a)', () => {
  const clientCapabilities = {
    elicitation: { form: {}, url: {} },
    extensions: {
      'io.modelcontextprotocol/ui': { mimeTypes: ['text/html;profile=mcp-app'] },
    },
  };
  const serverCapabilities = {
    tools: { listChanged: true },
    resources: { subscribe: true, listChanged: true },
    prompts: { listChanged: false },
    completions: {},
    extensions: {
      'io.modelcontextprotocol/tasks': {},
    },
  };

  it('client /ui is NOT active unless the server also advertises it', () => {
    expect(
      isExtensionActive(
        'io.modelcontextprotocol/ui',
        clientCapabilities.extensions,
        serverCapabilities.extensions,
      ),
    ).toBe(false);
    // The supporting peer (client) falls back to core behavior.
    expect(decideExtensionFallback({ active: false, mandatory: false })).toBe('fallback');
  });

  it('server /tasks is NOT active unless the client also advertises it', () => {
    expect(
      isExtensionActive(
        'io.modelcontextprotocol/tasks',
        clientCapabilities.extensions,
        serverCapabilities.extensions,
      ),
    ).toBe(false);
  });

  it('the intersection is empty when the two sides advertise different extensions', () => {
    expect(
      intersectExtensions(clientCapabilities.extensions, serverCapabilities.extensions),
    ).toEqual([]);
  });

  it('/ui becomes active once the server also advertises it', () => {
    const serverAlsoUi = {
      ...serverCapabilities.extensions,
      'io.modelcontextprotocol/ui': {},
    };
    expect(
      isExtensionActive('io.modelcontextprotocol/ui', clientCapabilities.extensions, serverAlsoUi),
    ).toBe(true);
    expect(intersectExtensions(clientCapabilities.extensions, serverAlsoUi)).toEqual([
      'io.modelcontextprotocol/ui',
    ]);
  });

  it('handles the forward-compatibility example: null + unknown key + unknown setting', () => {
    const received = {
      tools: { listChanged: true },
      futureFeature: { anything: true },
      extensions: {
        'io.modelcontextprotocol/ui': {
          mimeTypes: ['text/html;profile=mcp-app'],
          unknownSetting: 42,
        },
        'com.other/unknown': {},
        'io.modelcontextprotocol/broken': null,
      },
    };

    // Unknown capability field is ignored, message not rejected.
    expect(unknownCapabilityFields(received, KNOWN_SERVER_CAPABILITY_FIELDS)).toEqual(['futureFeature']);

    // null entry dropped; ui retained; com.other/unknown retained for intersection.
    const normalized = normalizeExtensionsMap(received.extensions);
    expect(Object.keys(normalized).sort()).toEqual([
      'com.other/unknown',
      'io.modelcontextprotocol/ui',
    ]);

    // Unknown setting on the recognized extension is ignored by the extension.
    const ui = getExtensionSettings(received.extensions, 'io.modelcontextprotocol/ui')!;
    expect(pickKnownSettings(ui, ['mimeTypes'])).toEqual({
      mimeTypes: ['text/html;profile=mcp-app'],
    });
  });
});
