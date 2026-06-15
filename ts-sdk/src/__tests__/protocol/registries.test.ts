/**
 * Tests for S46 — Consolidated Registries: Methods, Errors, `_meta` Keys,
 * Capabilities & Types (Appendices A–E).
 *
 * AC coverage:
 *  AC-46.1  (R-AppB-a) — a custom error code must not collide with any registry code
 *  AC-46.2  (R-AppB-b) — codes in -32000..-32099 accepted only if collision-free; -32001 reserved
 *  AC-46.3  (R-AppC-a) — registry-reserved keys are permitted, not unknown/custom
 *  AC-46.4  (R-AppC-b) — protocolVersion REQUIRED on every client request
 *  AC-46.5  (R-AppC-c) — clientInfo REQUIRED on every client request
 *  AC-46.6  (R-AppC-d) — clientCapabilities REQUIRED on every client request
 *  AC-46.7  (R-AppC-e) — logLevel OPTIONAL and Deprecated
 *  AC-46.8  (R-AppC-f) — progressToken OPTIONAL; string|number echoed by notifications/progress
 *  AC-46.9  (R-AppC-g) — traceparent/tracestate/baggage OPTIONAL on requests and notifications
 *  AC-46.10 (R-AppC-h, R-AppD-f) — UI host value carries REQUIRED mimeTypes
 *  AC-46.11 (R-AppC-i) — tool _meta.ui requires resourceUri (ui:// URI), optional visibility
 *  AC-46.12 (R-AppC-j) — extension-defined identifiers/keys permitted in _meta / extensions
 *  AC-46.13 (R-AppD-a) — elicitation: form OPTIONAL; url the other mode
 *  AC-46.14 (R-AppD-b) — sampling: tools & context OPTIONAL (context Deprecated); capability Deprecated
 *  AC-46.15 (R-AppD-c) — tools: listChanged OPTIONAL boolean
 *  AC-46.16 (R-AppD-d) — resources: listChanged & subscribe OPTIONAL booleans
 *  AC-46.17 (R-AppD-e) — prompts: listChanged OPTIONAL boolean
 *  AC-46.18 (R-AppD-f) — UI host mimeTypes REQUIRED string array incl. text/html;profile=mcp-app; ack MAY be empty
 *
 * Plus structural coverage of Appendix A (method index) and Appendix E (type index).
 */

import { describe, it, expect } from 'vitest';
import {
  // Appendix A
  METHOD_REGISTRY,
  UI_DIALECT_METHOD_INDEX,
  RegistryMethodKind,
  lookupMethod,
  isRegisteredMethod,
  // Appendix B
  ERROR_CODE_REGISTRY,
  RESERVED_ERROR_CODES,
  SERVER_ERROR_RANGE,
  validateCustomErrorCode,
  validateExtensionErrorCode,
  isErrorCodeDefinedByDocument,
  APPENDIX_B_RESERVED_CODE_SET,
  // Appendix C
  META_KEY_REGISTRY,
  lookupMetaKey,
  isReservedMetaKey,
  isMetaKeyPermitted,
  requiredClientRequestMetaKeys,
  // Appendix D
  CAPABILITY_REGISTRY,
  lookupCapability,
  lookupCapabilitySubFlag,
  UI_HOST_REQUIRED_MIME_TYPE,
  validateUiHostValue,
  validateToolUiMetaValue,
  // Appendix E
  TYPE_REGISTRY,
  lookupType,
} from '../../protocol/registries.js';

// ─── Appendix A — Method and Notification Index ─────────────────────────────────

describe('Appendix A — Method and Notification Index', () => {
  it('indexes every core method and notification with kind, direction, and section', () => {
    expect(METHOD_REGISTRY.length).toBe(28);
    for (const entry of METHOD_REGISTRY) {
      expect(typeof entry.name).toBe('string');
      expect(entry.name.length).toBeGreaterThan(0);
      expect(Object.values(RegistryMethodKind)).toContain(entry.kind);
      expect(entry.direction.length).toBeGreaterThan(0);
      expect(entry.definedIn.startsWith('§')).toBe(true);
    }
  });

  it('classifies the three input-request kinds as input-request, delivered via §11', () => {
    for (const name of ['elicitation/create', 'sampling/createMessage', 'roots/list']) {
      const entry = lookupMethod(name);
      expect(entry?.kind).toBe(RegistryMethodKind.INPUT_REQUEST);
      expect(entry?.direction).toContain('input-required result');
    }
  });

  it('records core requests and notifications with their direction', () => {
    expect(lookupMethod('tools/list')).toMatchObject({
      kind: RegistryMethodKind.REQUEST,
      direction: 'client→server',
    });
    expect(lookupMethod('notifications/message')).toMatchObject({
      kind: RegistryMethodKind.NOTIFICATION,
      direction: 'server→client',
    });
    expect(lookupMethod('notifications/progress')?.direction).toBe(
      'client→server or server→client',
    );
  });

  it('scopes UI-dialect names to the active UI extension and finds them only when requested', () => {
    // Not in the core index:
    expect(isRegisteredMethod('ui/open-link')).toBe(false);
    expect(lookupMethod('ui/open-link')).toBeUndefined();
    // Found only when the UI dialect is included:
    const uiEntry = lookupMethod('ui/open-link', true);
    expect(uiEntry?.extensionScoped).toBe(true);
    // The two handshake names are part of the core index but marked extension-scoped:
    expect(lookupMethod('ui/initialize')?.extensionScoped).toBe(true);
    expect(UI_DIALECT_METHOD_INDEX.every((e) => e.extensionScoped)).toBe(true);
  });

  it('returns undefined for an unknown method name', () => {
    expect(lookupMethod('does/not-exist')).toBeUndefined();
    expect(isRegisteredMethod('does/not-exist')).toBe(false);
  });
});

// ─── Appendix B — Error Code Registry ───────────────────────────────────────────

describe('Appendix B — Error Code Registry (reuses §22)', () => {
  it('re-exports the §22 registry unchanged', () => {
    for (const code of [-32700, -32600, -32601, -32602, -32603, -32003, -32004, -32001]) {
      expect(ERROR_CODE_REGISTRY[code]).toBeDefined();
    }
  });

  // AC-46.1
  it('AC-46.1 — a custom code colliding with any listed code is non-conformant', () => {
    for (const code of [-32700, -32600, -32601, -32602, -32603, -32003, -32004, -32001]) {
      expect(isErrorCodeDefinedByDocument(code)).toBe(true);
      const result = validateCustomErrorCode(code);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('collides-with-reserved');
      }
    }
    // The full registry (including the legacy -32002 resource-not-found literal) is caught.
    expect(isErrorCodeDefinedByDocument(-32002)).toBe(true);
    // A genuinely custom, collision-free code is accepted.
    const ok = validateCustomErrorCode(-31000);
    expect(ok.ok).toBe(true);
  });

  // AC-46.2
  it('AC-46.2 — codes in -32000..-32099 accepted only when collision-free; -32001 reserved', () => {
    expect(SERVER_ERROR_RANGE).toEqual({ min: -32099, max: -32000 });
    // -32001 (HeaderMismatch) collides → rejected.
    const collide = validateCustomErrorCode(-32001);
    expect(collide.ok).toBe(false);
    // A free value inside the range is accepted and flagged as in-range.
    const inRange = validateCustomErrorCode(-32050);
    expect(inRange.ok).toBe(true);
    if (inRange.ok) {
      expect(inRange.inReservedRange).toBe(true);
    }
    // A free value outside the range is accepted and flagged out-of-range.
    const outOfRange = validateCustomErrorCode(-31000);
    expect(outOfRange.ok).toBe(true);
    if (outOfRange.ok) {
      expect(outOfRange.inReservedRange).toBe(false);
    }
    // Non-integers are rejected (delegated to the §22 helper, which stays in lockstep).
    const frac = validateCustomErrorCode(-32000.5);
    expect(frac.ok).toBe(false);
    expect(validateExtensionErrorCode(-32000.5).ok).toBe(false);
  });

  it('the reserved-code set matches the §22 reserved list and includes -32001', () => {
    expect(APPENDIX_B_RESERVED_CODE_SET.size).toBe(RESERVED_ERROR_CODES.length);
    expect(APPENDIX_B_RESERVED_CODE_SET.has(-32001)).toBe(true);
  });
});

// ─── Appendix C — Reserved _meta Key Registry ───────────────────────────────────

describe('Appendix C — Reserved _meta Key Registry', () => {
  it('enumerates every reserved key with usedOn, meaning, and section', () => {
    for (const entry of META_KEY_REGISTRY) {
      expect(entry.key.length).toBeGreaterThan(0);
      expect(entry.usedOn.length).toBeGreaterThan(0);
      expect(entry.meaning.length).toBeGreaterThan(0);
      expect(entry.definedIn.startsWith('§')).toBe(true);
      expect(['required', 'optional']).toContain(entry.requirement);
    }
  });

  // AC-46.3
  it('AC-46.3 — registry-reserved keys are permitted, not treated as unknown/custom', () => {
    const reserved = [
      'io.modelcontextprotocol/protocolVersion',
      'io.modelcontextprotocol/clientInfo',
      'io.modelcontextprotocol/clientCapabilities',
      'io.modelcontextprotocol/logLevel',
      'io.modelcontextprotocol/subscriptionId',
      'io.modelcontextprotocol/tasks',
      'io.modelcontextprotocol/ui',
      'progressToken',
      'traceparent',
      'tracestate',
      'baggage',
    ];
    for (const key of reserved) {
      expect(isReservedMetaKey(key)).toBe(true);
      expect(isMetaKeyPermitted(key)).toBe(true);
    }
    // Any other io.modelcontextprotocol/ key is reserved by prefix.
    expect(isReservedMetaKey('io.modelcontextprotocol/somethingNew')).toBe(true);
    // A bare custom key (no prefix, not reserved-by-exception) is neither reserved nor permitted.
    expect(isReservedMetaKey('customBareKey')).toBe(false);
    expect(isMetaKeyPermitted('customBareKey')).toBe(false);
  });

  // AC-46.4, AC-46.5, AC-46.6
  it('AC-46.4/5/6 — protocolVersion, clientInfo, clientCapabilities are REQUIRED on client requests', () => {
    const required = requiredClientRequestMetaKeys();
    expect(required).toEqual([
      'io.modelcontextprotocol/protocolVersion',
      'io.modelcontextprotocol/clientInfo',
      'io.modelcontextprotocol/clientCapabilities',
    ]);
    for (const key of required) {
      const entry = lookupMetaKey(key);
      expect(entry?.requirement).toBe('required');
      expect(entry?.usedOn.startsWith('every client request')).toBe(true);
    }
  });

  // AC-46.7
  it('AC-46.7 — logLevel is OPTIONAL and Deprecated', () => {
    const entry = lookupMetaKey('io.modelcontextprotocol/logLevel');
    expect(entry?.requirement).toBe('optional');
    expect(entry?.deprecated).toBe(true);
  });

  // AC-46.8
  it('AC-46.8 — progressToken is OPTIONAL and echoed by notifications/progress', () => {
    const entry = lookupMetaKey('progressToken');
    expect(entry?.requirement).toBe('optional');
    expect(entry?.meaning).toContain('notifications/progress');
    expect(entry?.meaning).toContain('string or number');
  });

  // AC-46.9
  it('AC-46.9 — traceparent/tracestate/baggage are OPTIONAL on requests and notifications', () => {
    for (const key of ['traceparent', 'tracestate', 'baggage']) {
      const entry = lookupMetaKey(key);
      expect(entry?.requirement).toBe('optional');
      expect(entry?.usedOn).toContain('request and notification');
    }
  });

  // AC-46.12
  it('AC-46.12 — extension-defined identifiers/keys not in the registry are still permitted', () => {
    // A non-reserved, validly prefixed extension key: permitted (but not "reserved by this document").
    expect(isReservedMetaKey('com.example.acme/customKey')).toBe(false);
    expect(isMetaKeyPermitted('com.example.acme/customKey')).toBe(true);
    // It is not an enumerated registry row.
    expect(lookupMetaKey('com.example.acme/customKey')).toBeUndefined();
  });
});

// ─── Appendix C/D — UI host value and tool _meta.ui ─────────────────────────────

describe('Appendix C/D — UI host value and tool _meta.ui shapes', () => {
  // AC-46.10, AC-46.18
  it('AC-46.10/18 — UI host value carries REQUIRED mimeTypes including text/html;profile=mcp-app', () => {
    expect(UI_HOST_REQUIRED_MIME_TYPE).toBe('text/html;profile=mcp-app');
    expect(validateUiHostValue({ mimeTypes: ['text/html;profile=mcp-app'] })).toEqual({ ok: true });
    // Absence of mimeTypes is non-conformant.
    expect(validateUiHostValue({})).toEqual({ ok: false, reason: 'missing-mimeTypes' });
    // mimeTypes present but missing the required type.
    expect(validateUiHostValue({ mimeTypes: ['text/plain'] })).toEqual({
      ok: false,
      reason: 'missing-required-mime-type',
    });
    // Non-array mimeTypes.
    expect(validateUiHostValue({ mimeTypes: 'text/html;profile=mcp-app' })).toEqual({
      ok: false,
      reason: 'mimeTypes-not-array',
    });
    // Non-object host value.
    expect(validateUiHostValue(null)).toEqual({ ok: false, reason: 'not-an-object' });
  });

  it('AC-46.18 — a server acknowledgement value MAY be empty (host validator is for the host value)', () => {
    // The registry records that the *acknowledgement* value may be empty; the
    // capability entry documents both sides.
    const entry = lookupCapability('io.modelcontextprotocol/ui');
    const mimeFlag = lookupCapabilitySubFlag('io.modelcontextprotocol/ui', 'mimeTypes');
    expect(entry?.extension).toBe(true);
    expect(mimeFlag?.requirement).toBe('required');
    expect(mimeFlag?.gates).toContain('server acknowledgement value MAY be empty');
  });

  // AC-46.11
  it('AC-46.11 — tool _meta.ui requires a ui:// resourceUri; visibility is optional', () => {
    expect(validateToolUiMetaValue({ resourceUri: 'ui://charts/line', visibility: 'inline' })).toEqual({
      ok: true,
    });
    // visibility omitted is still fine (OPTIONAL).
    expect(validateToolUiMetaValue({ resourceUri: 'ui://charts/line' })).toEqual({ ok: true });
    // resourceUri absent is non-conformant.
    expect(validateToolUiMetaValue({ visibility: 'inline' })).toEqual({
      ok: false,
      reason: 'missing-resourceUri',
    });
    // resourceUri not a ui:// URI is non-conformant.
    expect(validateToolUiMetaValue({ resourceUri: 'https://example.com/x' })).toEqual({
      ok: false,
      reason: 'resourceUri-not-ui-uri',
    });
    // Non-object value.
    expect(validateToolUiMetaValue('nope')).toEqual({ ok: false, reason: 'not-an-object' });
    // The registry marks the key REQUIRED and UI-extension-scoped.
    const uiKey = lookupMetaKey('ui');
    expect(uiKey?.requirement).toBe('required');
    expect(uiKey?.meaning).toContain('user-interface extension is active');
  });
});

// ─── Appendix D — Capability Registry ───────────────────────────────────────────

describe('Appendix D — Capability Registry', () => {
  it('enumerates client, server, and extension capabilities with sides and sections', () => {
    for (const entry of CAPABILITY_REGISTRY) {
      expect(entry.capability.length).toBeGreaterThan(0);
      expect(['client', 'server', 'host', 'host/server', 'client and server']).toContain(entry.side);
      expect(entry.definedIn.startsWith('§')).toBe(true);
    }
    // extensions appears on both sides; lookup disambiguates by side.
    expect(lookupCapability('extensions', 'client')?.side).toBe('client');
    expect(lookupCapability('extensions', 'server')?.side).toBe('server');
  });

  // AC-46.13
  it('AC-46.13 — elicitation: form OPTIONAL; url recognized as the other mode', () => {
    const form = lookupCapabilitySubFlag('elicitation', 'form', 'client');
    expect(form?.requirement).toBe('optional');
    expect(form?.gates).toContain('url mode');
  });

  // AC-46.14
  it('AC-46.14 — sampling: tools & context OPTIONAL (context Deprecated); capability Deprecated', () => {
    const sampling = lookupCapability('sampling', 'client');
    expect(sampling?.deprecated).toBe(true);
    const tools = lookupCapabilitySubFlag('sampling', 'tools', 'client');
    const context = lookupCapabilitySubFlag('sampling', 'context', 'client');
    expect(tools?.requirement).toBe('optional');
    expect(tools?.gates).toContain('tools/toolChoice');
    expect(context?.requirement).toBe('optional');
    expect(context?.deprecated).toBe(true);
    expect(context?.gates).toContain('includeContext');
  });

  // AC-46.15
  it('AC-46.15 — tools: listChanged OPTIONAL boolean', () => {
    const flag = lookupCapabilitySubFlag('tools', 'listChanged', 'server');
    expect(flag?.requirement).toBe('optional');
    expect(flag?.boolean).toBe(true);
  });

  // AC-46.16
  it('AC-46.16 — resources: listChanged & subscribe OPTIONAL booleans', () => {
    const listChanged = lookupCapabilitySubFlag('resources', 'listChanged', 'server');
    const subscribe = lookupCapabilitySubFlag('resources', 'subscribe', 'server');
    expect(listChanged?.requirement).toBe('optional');
    expect(listChanged?.boolean).toBe(true);
    expect(subscribe?.requirement).toBe('optional');
    expect(subscribe?.boolean).toBe(true);
  });

  // AC-46.17
  it('AC-46.17 — prompts: listChanged OPTIONAL boolean', () => {
    const flag = lookupCapabilitySubFlag('prompts', 'listChanged', 'server');
    expect(flag?.requirement).toBe('optional');
    expect(flag?.boolean).toBe(true);
  });

  it('records the empty-value and deprecated capabilities (roots, completions, logging)', () => {
    expect(lookupCapability('roots', 'client')?.deprecated).toBe(true);
    expect(lookupCapability('roots', 'client')?.subFlags).toEqual([]);
    expect(lookupCapability('completions', 'server')?.subFlags).toEqual([]);
    expect(lookupCapability('logging', 'server')?.deprecated).toBe(true);
    expect(lookupCapability('io.modelcontextprotocol/tasks')?.side).toBe('client and server');
  });
});

// ─── Appendix E — Consolidated Type Index ───────────────────────────────────────

describe('Appendix E — Consolidated Type Index', () => {
  it('lists every wire type with a defining section and a one-line purpose', () => {
    expect(TYPE_REGISTRY.length).toBeGreaterThan(100);
    for (const entry of TYPE_REGISTRY) {
      expect(entry.type.length).toBeGreaterThan(0);
      expect(entry.definedIn.startsWith('§')).toBe(true);
      expect(entry.purpose.length).toBeGreaterThan(0);
    }
  });

  it('mirrors the published Appendix E order (broadly case-insensitive alphabetical)', () => {
    // S46 reproduces the spec's authoritative Appendix E table verbatim. The
    // spec orders entries "case-insensitive, ASCII", but its published order is
    // the normative artifact this registry consolidates — so we assert that the
    // registry is broadly alphabetical by first letter (a stable, spec-faithful
    // invariant) rather than re-deriving a strict sort the published table does
    // not itself satisfy at every adjacency (e.g. TaskStatus precedes
    // TasksExtensionCapability in the spec table).
    const firstLetters = TYPE_REGISTRY.map((e) => e.type[0]!.toLowerCase());
    for (let i = 1; i < firstLetters.length; i += 1) {
      expect(firstLetters[i]! >= firstLetters[i - 1]!).toBe(true);
    }
    // Sanity: the index opens at 'Annotations' and closes at 'WorkingTask'.
    expect(TYPE_REGISTRY[0]?.type).toBe('Annotations');
    expect(TYPE_REGISTRY[TYPE_REGISTRY.length - 1]?.type).toBe('WorkingTask');
  });

  it('has no duplicate type names', () => {
    const names = TYPE_REGISTRY.map((e) => e.type);
    expect(new Set(names).size).toBe(names.length);
  });

  it('looks up a representative type and rejects an unknown one', () => {
    expect(lookupType('CallToolResult')?.definedIn).toContain('tools/call');
    expect(lookupType('NotARealType')).toBeUndefined();
  });
});
