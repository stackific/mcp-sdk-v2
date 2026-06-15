/**
 * S46 — Consolidated Registries: Methods, Errors, `_meta` Keys, Capabilities,
 * and Types (Appendices A–E).
 *
 * The capstone reference artifact: five authoritative, document-wide tables that
 * enumerate the wire surface defined across the whole specification, each row
 * pointing to the section that normatively specifies the entry. These appendices
 * define no new wire types — they are a *consolidation*, not a new definition,
 * and the cited section remains normative.
 *
 * This module REUSES existing bindings rather than redefining them:
 *   - The §22 error-code registry is re-exported from `./errors.js`
 *     (`ERROR_CODE_REGISTRY`, `RESERVED_ERROR_CODES`, `validateExtensionErrorCode`);
 *     it is never rebuilt here.
 *   - The reserved-bare-key set and the prefix-reservation predicate come from
 *     `./meta.js` (`RESERVED_BARE_KEYS`) and `../json/meta-key.js`
 *     (`isReservedMetaKeyPrefix`, `parseMetaKey`).
 *
 * The four NEW registries (methods, `_meta` keys, capabilities, types) are
 * expressed as DATA structures over the literal wire names plus their metadata
 * (direction, kind, capability gating, owning section), mirroring the
 * registry-as-data style of `./errors.js`. Method/key/capability names appear as
 * string literals in the data — this is deliberate and safer than importing the
 * scattered method-name constants from a dozen sibling modules.
 */

import {
  ERROR_CODE_REGISTRY,
  RESERVED_ERROR_CODES,
  SERVER_ERROR_RANGE,
  validateExtensionErrorCode,
  HEADER_MISMATCH_CODE,
} from './errors.js';
import { RESERVED_BARE_KEYS } from './meta.js';
import { isReservedMetaKeyPrefix, parseMetaKey } from '../json/meta-key.js';

// ─── Appendix B re-export (the §22 registry, never rebuilt) ─────────────────────

/**
 * Appendix B IS the §22 Error Code Registry. Rather than restate it, S46
 * re-exports the existing authoritative table and its collision helpers so a
 * caller can reach the whole error surface through the registries module.
 * (Appendix B; R-AppB-a, R-AppB-b)
 */
export {
  ERROR_CODE_REGISTRY,
  RESERVED_ERROR_CODES,
  validateExtensionErrorCode,
} from './errors.js';

/**
 * Validates a custom error `code` against Appendix B's collision rule: a custom
 * code MUST NOT equal any code listed in the Error Code Registry (the five
 * standard JSON-RPC codes, the two protocol codes, and `-32001` HeaderMismatch).
 * (R-AppB-a, AC-46.1)
 *
 * Codes inside the reserved server-error range `-32000..-32099` are permitted
 * only when they avoid collision with a code this document defines (notably
 * `-32001`); `-32000..-32099` is the range in which additions are explicitly
 * allowed. (R-AppB-b, AC-46.2)
 *
 * Returns `{ ok: true }` when the code is usable, otherwise `{ ok: false }` with
 * a machine-readable `reason`. Delegates the integer/collision check to
 * {@link validateExtensionErrorCode} (the §22 helper) so the two stay in lockstep.
 */
export function validateCustomErrorCode(
  code: number,
):
  | { ok: true; inReservedRange: boolean }
  | { ok: false; reason: 'not-an-integer' | 'collides-with-reserved' } {
  const result = validateExtensionErrorCode(code);
  if (!result.ok) {
    return result;
  }
  const inReservedRange = code >= SERVER_ERROR_RANGE.min && code <= SERVER_ERROR_RANGE.max;
  return { ok: true, inReservedRange };
}

/**
 * The bounds of the reserved server-error range `-32000..-32099` within which
 * implementations MAY define additional codes (avoiding collision with the
 * `-32001` HeaderMismatch code this document already places there). Re-exported
 * from `./errors.js` for Appendix B callers. (R-AppB-b, AC-46.2)
 */
export { SERVER_ERROR_RANGE } from './errors.js';

// ─── Appendix A: Method and Notification Index ──────────────────────────────────

/**
 * The {@link MethodNotificationIndexEntry.kind} column of Appendix A: whether a
 * name is a request (expects a response), a notification (no response), or an
 * input-request kind delivered embedded in an input-required result (§11) rather
 * than as a standalone server-initiated request. (Appendix A)
 */
export const RegistryMethodKind = {
  /** A request that expects a response. */
  REQUEST: 'request',
  /** A notification — no response is sent. */
  NOTIFICATION: 'notification',
  /**
   * An input-request kind (`elicitation/create`, `sampling/createMessage`,
   * `roots/list`): delivered inside an input-required result and resolved by
   * client retry (§11); NOT a standalone server-initiated JSON-RPC request.
   */
  INPUT_REQUEST: 'input-request kind',
} as const;

/** One of the {@link RegistryMethodKind} values. */
export type RegistryMethodKind =
  (typeof RegistryMethodKind)[keyof typeof RegistryMethodKind];

/** One row of Appendix A — a single method or notification name. */
export interface MethodNotificationIndexEntry {
  /** The JSON-RPC method or notification name (for example `tools/list`). */
  readonly name: string;
  /** Whether the name is a request, a notification, or an input-request kind. */
  readonly kind: RegistryMethodKind;
  /** The normal sender→receiver pairing (for example `client→server`). */
  readonly direction: string;
  /** The section that normatively defines the message. */
  readonly definedIn: string;
  /** When `true`, the name is only in scope while the named extension is active. */
  readonly extensionScoped?: boolean;
}

/**
 * Appendix A — the Method and Notification Index: every JSON-RPC method and
 * notification defined by the document and its extensions, with its kind,
 * direction, and defining section. (Appendix A)
 *
 * The three input-request kinds (`elicitation/create`, `sampling/createMessage`,
 * `roots/list`) are delivered embedded in an input-required result and are NOT
 * standalone server-initiated requests (see {@link RegistryMethodKind}).
 *
 * The trailing `UI↔host` rows are the additional user-interface-dialect names
 * (§26) that are in scope only when the UI extension is active; they carry
 * `extensionScoped: true`.
 */
export const METHOD_REGISTRY: readonly MethodNotificationIndexEntry[] = [
  // ── Core requests (client→server) ──
  { name: 'server/discover', kind: RegistryMethodKind.REQUEST, direction: 'client→server', definedIn: '§5 Protocol Revision, Version Negotiation, and Discovery' },
  { name: 'tools/list', kind: RegistryMethodKind.REQUEST, direction: 'client→server', definedIn: '§16 Tools' },
  { name: 'tools/call', kind: RegistryMethodKind.REQUEST, direction: 'client→server', definedIn: '§16 Tools' },
  { name: 'resources/list', kind: RegistryMethodKind.REQUEST, direction: 'client→server', definedIn: '§17 Resources' },
  { name: 'resources/read', kind: RegistryMethodKind.REQUEST, direction: 'client→server', definedIn: '§17 Resources' },
  { name: 'resources/templates/list', kind: RegistryMethodKind.REQUEST, direction: 'client→server', definedIn: '§17 Resources' },
  { name: 'prompts/list', kind: RegistryMethodKind.REQUEST, direction: 'client→server', definedIn: '§18 Prompts' },
  { name: 'prompts/get', kind: RegistryMethodKind.REQUEST, direction: 'client→server', definedIn: '§18 Prompts' },
  { name: 'completion/complete', kind: RegistryMethodKind.REQUEST, direction: 'client→server', definedIn: '§19 Completion' },
  { name: 'subscriptions/listen', kind: RegistryMethodKind.REQUEST, direction: 'client→server', definedIn: '§10 Server-to-Client Streaming and Subscriptions' },
  // ── Input-request kinds (server→client via input-required result, §11) ──
  { name: 'elicitation/create', kind: RegistryMethodKind.INPUT_REQUEST, direction: 'server→client (via input-required result, §11)', definedIn: '§20 Elicitation' },
  { name: 'sampling/createMessage', kind: RegistryMethodKind.INPUT_REQUEST, direction: 'server→client (via input-required result, §11)', definedIn: '§21 Deprecated Client-Provided Capabilities' },
  { name: 'roots/list', kind: RegistryMethodKind.INPUT_REQUEST, direction: 'server→client (via input-required result, §11)', definedIn: '§21 Deprecated Client-Provided Capabilities' },
  // ── Tasks extension requests (client→server) ──
  { name: 'tasks/get', kind: RegistryMethodKind.REQUEST, direction: 'client→server', definedIn: '§25 The Tasks Extension' },
  { name: 'tasks/update', kind: RegistryMethodKind.REQUEST, direction: 'client→server', definedIn: '§25 The Tasks Extension' },
  { name: 'tasks/cancel', kind: RegistryMethodKind.REQUEST, direction: 'client→server', definedIn: '§25 The Tasks Extension' },
  // ── UI extension handshake (UI↔host) ──
  { name: 'ui/initialize', kind: RegistryMethodKind.REQUEST, direction: 'UI↔host (UI→host)', definedIn: '§26 The Interactive User-Interface Extension', extensionScoped: true },
  { name: 'ui/notifications/initialized', kind: RegistryMethodKind.NOTIFICATION, direction: 'UI↔host (UI→host)', definedIn: '§26 The Interactive User-Interface Extension', extensionScoped: true },
  // ── Notifications ──
  { name: 'notifications/progress', kind: RegistryMethodKind.NOTIFICATION, direction: 'client→server or server→client', definedIn: '§15 Utilities: Progress, Cancellation, Logging, and Trace Context' },
  { name: 'notifications/cancelled', kind: RegistryMethodKind.NOTIFICATION, direction: 'client→server or server→client', definedIn: '§15 Utilities: Progress, Cancellation, Logging, and Trace Context' },
  { name: 'notifications/message', kind: RegistryMethodKind.NOTIFICATION, direction: 'server→client', definedIn: '§15 Utilities: Progress, Cancellation, Logging, and Trace Context' },
  { name: 'notifications/tools/list_changed', kind: RegistryMethodKind.NOTIFICATION, direction: 'server→client', definedIn: '§16 Tools' },
  { name: 'notifications/prompts/list_changed', kind: RegistryMethodKind.NOTIFICATION, direction: 'server→client', definedIn: '§18 Prompts' },
  { name: 'notifications/resources/list_changed', kind: RegistryMethodKind.NOTIFICATION, direction: 'server→client', definedIn: '§17 Resources' },
  { name: 'notifications/resources/updated', kind: RegistryMethodKind.NOTIFICATION, direction: 'server→client', definedIn: '§17 Resources' },
  { name: 'notifications/subscriptions/acknowledged', kind: RegistryMethodKind.NOTIFICATION, direction: 'server→client', definedIn: '§10 Server-to-Client Streaming and Subscriptions' },
  { name: 'notifications/elicitation/complete', kind: RegistryMethodKind.NOTIFICATION, direction: 'server→client', definedIn: '§20 Elicitation' },
  { name: 'notifications/tasks', kind: RegistryMethodKind.NOTIFICATION, direction: 'server→client', definedIn: '§25 The Tasks Extension' },
];

/**
 * The additional UI-dialect message names (§26) exchanged on the UI message
 * channel (`UI↔host`), in scope ONLY when the user-interface extension is
 * active — beyond the two handshake names already in {@link METHOD_REGISTRY}.
 * Named `..._INDEX` to stay distinct from `UI_DIALECT_METHODS` (the method-name
 * constant map owned by `./ui-host.js`, S41).
 * Recorded separately because they are conditional on the extension. (Appendix A)
 */
export const UI_DIALECT_METHOD_INDEX: readonly MethodNotificationIndexEntry[] = [
  // Host → UI tool-data notifications
  { name: 'ui/notifications/tool-input', kind: RegistryMethodKind.NOTIFICATION, direction: 'UI↔host (host→UI)', definedIn: '§26 The Interactive User-Interface Extension', extensionScoped: true },
  { name: 'ui/notifications/tool-input-partial', kind: RegistryMethodKind.NOTIFICATION, direction: 'UI↔host (host→UI)', definedIn: '§26 The Interactive User-Interface Extension', extensionScoped: true },
  { name: 'ui/notifications/tool-result', kind: RegistryMethodKind.NOTIFICATION, direction: 'UI↔host (host→UI)', definedIn: '§26 The Interactive User-Interface Extension', extensionScoped: true },
  { name: 'ui/notifications/tool-cancelled', kind: RegistryMethodKind.NOTIFICATION, direction: 'UI↔host (host→UI)', definedIn: '§26 The Interactive User-Interface Extension', extensionScoped: true },
  // UI → host requests
  { name: 'tools/call', kind: RegistryMethodKind.REQUEST, direction: 'UI↔host (UI→host)', definedIn: '§26 The Interactive User-Interface Extension', extensionScoped: true },
  { name: 'resources/read', kind: RegistryMethodKind.REQUEST, direction: 'UI↔host (UI→host)', definedIn: '§26 The Interactive User-Interface Extension', extensionScoped: true },
  { name: 'ui/open-link', kind: RegistryMethodKind.REQUEST, direction: 'UI↔host (UI→host)', definedIn: '§26 The Interactive User-Interface Extension', extensionScoped: true },
  { name: 'ui/message', kind: RegistryMethodKind.REQUEST, direction: 'UI↔host (UI→host)', definedIn: '§26 The Interactive User-Interface Extension', extensionScoped: true },
  { name: 'ui/request-display-mode', kind: RegistryMethodKind.REQUEST, direction: 'UI↔host (UI→host)', definedIn: '§26 The Interactive User-Interface Extension', extensionScoped: true },
  { name: 'ui/update-model-context', kind: RegistryMethodKind.REQUEST, direction: 'UI↔host (UI→host)', definedIn: '§26 The Interactive User-Interface Extension', extensionScoped: true },
  // UI → host notification
  { name: 'notifications/message', kind: RegistryMethodKind.NOTIFICATION, direction: 'UI↔host (UI→host)', definedIn: '§26 The Interactive User-Interface Extension', extensionScoped: true },
  // Bidirectional
  { name: 'ping', kind: RegistryMethodKind.REQUEST, direction: 'UI↔host (bidirectional)', definedIn: '§26 The Interactive User-Interface Extension', extensionScoped: true },
  // Host → UI notifications and request
  { name: 'ui/notifications/size-changed', kind: RegistryMethodKind.NOTIFICATION, direction: 'UI↔host (host→UI)', definedIn: '§26 The Interactive User-Interface Extension', extensionScoped: true },
  { name: 'ui/notifications/host-context-changed', kind: RegistryMethodKind.NOTIFICATION, direction: 'UI↔host (host→UI)', definedIn: '§26 The Interactive User-Interface Extension', extensionScoped: true },
  { name: 'ui/resource-teardown', kind: RegistryMethodKind.REQUEST, direction: 'UI↔host (host→UI)', definedIn: '§26 The Interactive User-Interface Extension', extensionScoped: true },
  // Sandbox-bridging notifications
  { name: 'ui/notifications/sandbox-proxy-ready', kind: RegistryMethodKind.NOTIFICATION, direction: 'UI↔host (sandbox→host)', definedIn: '§26 The Interactive User-Interface Extension', extensionScoped: true },
  { name: 'ui/notifications/sandbox-resource-ready', kind: RegistryMethodKind.NOTIFICATION, direction: 'UI↔host (host→sandbox)', definedIn: '§26 The Interactive User-Interface Extension', extensionScoped: true },
];

/**
 * Looks up the Appendix A entry for a method or notification `name`, searching
 * the core index first and (when `includeUiDialect` is `true`) the UI-dialect
 * names. Returns `undefined` when the name is not in the index. (Appendix A)
 *
 * Because a handful of UI-dialect names (`tools/call`, `resources/read`,
 * `notifications/message`) shadow core names, the core index is preferred unless
 * a core hit is absent. To inspect a UI-dialect-only meaning, pass
 * `includeUiDialect: true` and read the returned `direction`/`definedIn`.
 */
export function lookupMethod(
  name: string,
  includeUiDialect = false,
): MethodNotificationIndexEntry | undefined {
  const core = METHOD_REGISTRY.find((entry) => entry.name === name);
  if (core) {
    return core;
  }
  return includeUiDialect
    ? UI_DIALECT_METHOD_INDEX.find((entry) => entry.name === name)
    : undefined;
}

/** Returns `true` when `name` appears in the core Appendix A index. */
export function isRegisteredMethod(name: string): boolean {
  return METHOD_REGISTRY.some((entry) => entry.name === name);
}

// ─── Appendix C: Reserved `_meta` Key Registry ──────────────────────────────────

/** One row of Appendix C — a reserved key that MAY appear in `_meta`. */
export interface MetaKeyRegistryEntry {
  /** The reserved `_meta` key (prefixed or bare-by-exception). */
  readonly key: string;
  /** Where the key normally appears. */
  readonly usedOn: string;
  /** Purpose, requirement level, and deprecation status where applicable. */
  readonly meaning: string;
  /** The section that normatively specifies the key. */
  readonly definedIn: string;
  /** Requirement level on the location named in `usedOn`. */
  readonly requirement: 'required' | 'optional';
  /** When `true`, the key carries Deprecated status. */
  readonly deprecated?: boolean;
}

/**
 * Appendix C — the Reserved `_meta` Key Registry: every key reserved by this
 * document that MAY appear in `_meta` (the `io.modelcontextprotocol/` prefixed
 * keys plus the four bare-by-exception keys), each with where it is used, its
 * meaning/requirement level, and its defining section. (Appendix C; R-AppC-a … j)
 */
export const META_KEY_REGISTRY: readonly MetaKeyRegistryEntry[] = [
  {
    key: 'io.modelcontextprotocol/protocolVersion',
    usedOn: 'every client request (_meta)',
    meaning: 'The protocol revision the request uses (the wire value, e.g. "2026-07-28"). REQUIRED on client requests.',
    definedIn: '§4 Request Metadata and the Stateless Model',
    requirement: 'required',
  },
  {
    key: 'io.modelcontextprotocol/clientInfo',
    usedOn: 'every client request (_meta)',
    meaning: 'An Implementation object identifying the client software issuing the request. REQUIRED on client requests.',
    definedIn: '§4 Request Metadata and the Stateless Model',
    requirement: 'required',
  },
  {
    key: 'io.modelcontextprotocol/clientCapabilities',
    usedOn: 'every client request (_meta)',
    meaning: 'A ClientCapabilities object declaring, for this request, the optional capabilities the client supports. REQUIRED on client requests.',
    definedIn: '§4 Request Metadata and the Stateless Model',
    requirement: 'required',
  },
  {
    key: 'io.modelcontextprotocol/logLevel',
    usedOn: 'client request _meta (OPTIONAL)',
    meaning: 'The minimum log severity the server may emit while processing this request, as a LoggingLevel string. Status: Deprecated.',
    definedIn: '§4 Request Metadata and the Stateless Model',
    requirement: 'optional',
    deprecated: true,
  },
  {
    key: 'progressToken',
    usedOn: 'request _meta (OPTIONAL)',
    meaning: 'Out-of-band progress correlation token; the value (a string or number) is echoed in notifications/progress to correlate updates with the originating request.',
    definedIn: '§15 Utilities: Progress, Cancellation, Logging, and Trace Context',
    requirement: 'optional',
  },
  {
    key: 'io.modelcontextprotocol/subscriptionId',
    usedOn: 'notification _meta on a subscription stream',
    meaning: 'Correlates a notification delivered on a subscriptions/listen stream with the subscription it belongs to; value is the subscription identifier as a string.',
    definedIn: '§10 Server-to-Client Streaming and Subscriptions',
    requirement: 'optional',
  },
  {
    key: 'traceparent',
    usedOn: 'request and notification _meta (OPTIONAL)',
    meaning: 'W3C Trace Context traceparent value, carried unchanged for distributed-trace propagation.',
    definedIn: '§15 Utilities: Progress, Cancellation, Logging, and Trace Context',
    requirement: 'optional',
  },
  {
    key: 'tracestate',
    usedOn: 'request and notification _meta (OPTIONAL)',
    meaning: 'W3C Trace Context tracestate value, carried unchanged for distributed-trace propagation.',
    definedIn: '§15 Utilities: Progress, Cancellation, Logging, and Trace Context',
    requirement: 'optional',
  },
  {
    key: 'baggage',
    usedOn: 'request and notification _meta (OPTIONAL)',
    meaning: 'W3C Baggage value, carried unchanged for distributed-trace propagation.',
    definedIn: '§15 Utilities: Progress, Cancellation, Logging, and Trace Context',
    requirement: 'optional',
  },
  {
    key: 'io.modelcontextprotocol/tasks',
    usedOn: 'extensions map within client clientCapabilities and within server capabilities',
    meaning: 'Extension identifier declaring support for the Tasks extension; its value is an OPTIONAL settings object (empty {} defined).',
    definedIn: '§25 The Tasks Extension',
    requirement: 'optional',
  },
  {
    key: 'io.modelcontextprotocol/ui',
    usedOn: 'extensions map within host/server capabilities',
    meaning: "Extension identifier declaring support for the Interactive User-Interface extension; the host's value carries the REQUIRED mimeTypes array.",
    definedIn: '§26 The Interactive User-Interface Extension',
    requirement: 'optional',
  },
  {
    key: 'ui',
    usedOn: "a Tool object's _meta (§16 Tools)",
    meaning: 'Declares the user interface associated with a tool: an object with REQUIRED resourceUri (a ui:// URI) and OPTIONAL visibility. In scope only when the user-interface extension is active.',
    definedIn: '§26 The Interactive User-Interface Extension',
    requirement: 'required',
  },
];

/**
 * Looks up the Appendix C entry for an exact reserved `key`, or `undefined` when
 * the key is not an enumerated registry row. Note this matches the literal rows
 * only; use {@link isReservedMetaKey} for the broader prefix-based reservation
 * test that covers all `io.modelcontextprotocol/…` keys. (Appendix C)
 */
export function lookupMetaKey(key: string): MetaKeyRegistryEntry | undefined {
  return META_KEY_REGISTRY.find((entry) => entry.key === key);
}

/**
 * Returns `true` when `key` is reserved by this document and so MAY appear in
 * `_meta` without being treated as an unknown/custom key: any key under the
 * reserved `io.modelcontextprotocol/`/`mcp` prefix, or one of the four
 * bare-by-exception keys (`progressToken`, `traceparent`, `tracestate`,
 * `baggage`). (R-AppC-a, AC-46.3)
 *
 * Reuses {@link RESERVED_BARE_KEYS} (S05) and {@link isReservedMetaKeyPrefix}
 * (S02) so the reservation surface stays single-sourced. Extension-defined keys
 * outside the reserved prefix are NOT reserved by this predicate — they are
 * nonetheless permitted in `_meta` by the §24/§4 namespacing rules; use
 * {@link isMetaKeyPermitted} to confirm a key MAY appear at all. (R-AppC-j)
 */
export function isReservedMetaKey(key: string): boolean {
  if (RESERVED_BARE_KEYS.has(key as never)) {
    return true;
  }
  const { prefix } = parseMetaKey(key);
  return prefix !== undefined && isReservedMetaKeyPrefix(prefix);
}

/**
 * Returns `true` when `key` MAY appear in `_meta` — either because it is a
 * registry-reserved key (see {@link isReservedMetaKey}) or because it is an
 * extension-defined key carried under a valid non-reserved prefix, which the
 * §24 extension-mechanism and §4 namespacing rules permit. (R-AppC-a, R-AppC-j,
 * AC-46.3, AC-46.12)
 *
 * A bare key that is neither reserved-by-exception nor prefixed is NOT permitted
 * (the spec requires a prefix for any non-reserved key).
 */
export function isMetaKeyPermitted(key: string): boolean {
  if (isReservedMetaKey(key)) {
    return true;
  }
  // An extension-defined key must carry a (non-reserved) prefix to be permitted.
  const { prefix } = parseMetaKey(key);
  return prefix !== undefined && !isReservedMetaKeyPrefix(prefix);
}

/** Returns the reserved keys (Appendix C rows) that are REQUIRED on a client request. (R-AppC-b … d) */
export function requiredClientRequestMetaKeys(): readonly string[] {
  return META_KEY_REGISTRY.filter(
    (entry) => entry.requirement === 'required' && entry.usedOn.startsWith('every client request'),
  ).map((entry) => entry.key);
}

// ─── Appendix D: Capability Registry ────────────────────────────────────────────

/** The {@link CapabilityRegistryEntry.side} column of Appendix D. */
export type CapabilitySide =
  | 'client'
  | 'server'
  | 'host'
  | 'host/server'
  | 'client and server';

/** A single nested sub-flag of a capability, with its optionality and notes. */
export interface CapabilitySubFlag {
  /** The sub-flag member name (for example `listChanged`, `form`, `mimeTypes`). */
  readonly name: string;
  /** Requirement level of the sub-flag. */
  readonly requirement: 'required' | 'optional';
  /** When `true`, the sub-flag is a boolean toggle. */
  readonly boolean?: boolean;
  /** When `true`, the sub-flag carries Deprecated status. */
  readonly deprecated?: boolean;
  /** One-line statement of what the sub-flag gates or carries. */
  readonly gates: string;
}

/** One row of Appendix D — a capability defined by this document. */
export interface CapabilityRegistryEntry {
  /** Capability name (for example `tools`, `io.modelcontextprotocol/ui`). */
  readonly capability: string;
  /** Which side(s) advertise the capability. */
  readonly side: CapabilitySide;
  /** Nested members defined for the capability (empty when the value is `{}`). */
  readonly subFlags: readonly CapabilitySubFlag[];
  /** The section that normatively specifies the capability. */
  readonly definedIn: string;
  /** When `true`, the capability as a whole carries Deprecated status. */
  readonly deprecated?: boolean;
  /** When `true`, the capability is negotiated through the `extensions` map. */
  readonly extension?: boolean;
}

/**
 * Appendix D — the Capability Registry: every client/server/extension capability
 * defined by this document, with its side, its sub-flags (and their optionality,
 * boolean-ness, and deprecation), and its defining section. (Appendix D;
 * R-AppD-a … f)
 */
export const CAPABILITY_REGISTRY: readonly CapabilityRegistryEntry[] = [
  // ── Client capabilities ──
  {
    capability: 'elicitation',
    side: 'client',
    subFlags: [
      { name: 'form', requirement: 'optional', gates: 'enables the form elicitation mode; the url mode is the other defined mode (§20)' },
    ],
    definedIn: '§6 Capabilities and Extensions',
  },
  {
    capability: 'roots',
    side: 'client',
    subFlags: [],
    definedIn: '§6 Capabilities and Extensions',
    deprecated: true,
  },
  {
    capability: 'sampling',
    side: 'client',
    subFlags: [
      { name: 'tools', requirement: 'optional', gates: 'enables the sampling tools/toolChoice parameters' },
      { name: 'context', requirement: 'optional', deprecated: true, gates: 'enables non-none includeContext values' },
    ],
    definedIn: '§6 Capabilities and Extensions',
    deprecated: true,
  },
  {
    capability: 'extensions',
    side: 'client',
    subFlags: [],
    definedIn: '§6 Capabilities and Extensions',
  },
  // ── Server capabilities ──
  {
    capability: 'tools',
    side: 'server',
    subFlags: [
      { name: 'listChanged', requirement: 'optional', boolean: true, gates: 'enables notifications/tools/list_changed' },
    ],
    definedIn: '§6 Capabilities and Extensions',
  },
  {
    capability: 'resources',
    side: 'server',
    subFlags: [
      { name: 'listChanged', requirement: 'optional', boolean: true, gates: 'enables notifications/resources/list_changed' },
      { name: 'subscribe', requirement: 'optional', boolean: true, gates: 'enables resource subscriptions (subscriptions/listen)' },
    ],
    definedIn: '§6 Capabilities and Extensions',
  },
  {
    capability: 'prompts',
    side: 'server',
    subFlags: [
      { name: 'listChanged', requirement: 'optional', boolean: true, gates: 'enables notifications/prompts/list_changed' },
    ],
    definedIn: '§6 Capabilities and Extensions',
  },
  {
    capability: 'completions',
    side: 'server',
    subFlags: [],
    definedIn: '§6 Capabilities and Extensions',
  },
  {
    capability: 'logging',
    side: 'server',
    subFlags: [],
    definedIn: '§6 Capabilities and Extensions',
    deprecated: true,
  },
  {
    capability: 'extensions',
    side: 'server',
    subFlags: [],
    definedIn: '§6 Capabilities and Extensions',
  },
  // ── Extension capabilities (negotiated via the extensions map) ──
  {
    capability: 'io.modelcontextprotocol/tasks',
    side: 'client and server',
    subFlags: [],
    definedIn: '§25 The Tasks Extension',
    extension: true,
  },
  {
    capability: 'io.modelcontextprotocol/ui',
    side: 'host/server',
    subFlags: [
      { name: 'mimeTypes', requirement: 'required', gates: 'host value: string array that MUST include "text/html;profile=mcp-app"; server acknowledgement value MAY be empty' },
    ],
    definedIn: '§26 The Interactive User-Interface Extension',
    extension: true,
  },
];

/**
 * Looks up the Appendix D entry for `capability`. When the same name is defined
 * on more than one side (`extensions` is both a client and a server capability),
 * pass `side` to disambiguate; otherwise the first match is returned. Returns
 * `undefined` when the capability is not in the registry. (Appendix D)
 */
export function lookupCapability(
  capability: string,
  side?: CapabilitySide,
): CapabilityRegistryEntry | undefined {
  return CAPABILITY_REGISTRY.find(
    (entry) => entry.capability === capability && (side === undefined || entry.side === side),
  );
}

/**
 * Returns the named sub-flag of a capability, or `undefined` when the capability
 * or the sub-flag is not defined. Handy for asserting a sub-flag's optionality,
 * boolean-ness, or deprecation. (Appendix D)
 */
export function lookupCapabilitySubFlag(
  capability: string,
  subFlag: string,
  side?: CapabilitySide,
): CapabilitySubFlag | undefined {
  return lookupCapability(capability, side)?.subFlags.find((flag) => flag.name === subFlag);
}

/**
 * The MIME type the `io.modelcontextprotocol/ui` host value's `mimeTypes` array
 * MUST include. (R-AppD-f, AC-46.18) Pinned as registry DATA; the UI extension
 * (§26) owns the normative type.
 */
export const UI_HOST_REQUIRED_MIME_TYPE = 'text/html;profile=mcp-app' as const;

/**
 * Validates the `io.modelcontextprotocol/ui` host value against Appendix C/D: it
 * MUST carry a `mimeTypes` array (REQUIRED) that includes
 * {@link UI_HOST_REQUIRED_MIME_TYPE}; absence of `mimeTypes` is non-conformant.
 * (R-AppC-h, R-AppD-f, AC-46.10, AC-46.18)
 *
 * A server *acknowledgement* value (as opposed to the host value) MAY be empty;
 * that case is the caller's to distinguish — this validator checks the host
 * value, where `mimeTypes` is required.
 */
export function validateUiHostValue(
  value: unknown,
): { ok: true } | { ok: false; reason: 'not-an-object' | 'missing-mimeTypes' | 'mimeTypes-not-array' | 'missing-required-mime-type' } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, reason: 'not-an-object' };
  }
  const mimeTypes = (value as Record<string, unknown>)['mimeTypes'];
  if (mimeTypes === undefined) {
    return { ok: false, reason: 'missing-mimeTypes' };
  }
  if (!Array.isArray(mimeTypes)) {
    return { ok: false, reason: 'mimeTypes-not-array' };
  }
  if (!mimeTypes.includes(UI_HOST_REQUIRED_MIME_TYPE)) {
    return { ok: false, reason: 'missing-required-mime-type' };
  }
  return { ok: true };
}

/**
 * Validates a `Tool` object's `_meta.ui` value against Appendix C: it MUST be an
 * object with a REQUIRED `resourceUri` that is a `ui://` URI and an OPTIONAL
 * `visibility`; absence of `resourceUri` (or a non-`ui://` value) is
 * non-conformant. The key is meaningful only when the UI extension is active.
 * (R-AppC-i, AC-46.11)
 */
export function validateToolUiMetaValue(
  value: unknown,
): { ok: true } | { ok: false; reason: 'not-an-object' | 'missing-resourceUri' | 'resourceUri-not-ui-uri' } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, reason: 'not-an-object' };
  }
  const resourceUri = (value as Record<string, unknown>)['resourceUri'];
  if (typeof resourceUri !== 'string') {
    return { ok: false, reason: 'missing-resourceUri' };
  }
  if (!resourceUri.startsWith('ui://')) {
    return { ok: false, reason: 'resourceUri-not-ui-uri' };
  }
  return { ok: true };
}

// ─── Appendix E: Consolidated Type Index ────────────────────────────────────────

/** One row of Appendix E — a named wire type declared by this document. */
export interface TypeIndexEntry {
  /** The wire type (interface or type alias) name. */
  readonly type: string;
  /** The section containing the type's full canonical declaration. */
  readonly definedIn: string;
  /** One-line statement of the type's purpose. */
  readonly purpose: string;
}

/**
 * Appendix E — the Consolidated Type Index: every wire type (interface or type
 * alias) declared by this document, alphabetically sorted (case-insensitive),
 * each with its canonical defining section and a one-line purpose. (Appendix E)
 */
export const TYPE_REGISTRY: readonly TypeIndexEntry[] = [
  { type: 'Annotations', definedIn: '§14.6 Annotations', purpose: 'Optional client-facing hints (audience, priority, timestamps) attachable to content and resources.' },
  { type: 'AudioContent', definedIn: '§14.4.3 AudioContent', purpose: 'Content block carrying base64-encoded audio data with a MIME type.' },
  { type: 'AuthorizationServerMetadata', definedIn: '§23.3 Authorization Server Metadata Discovery', purpose: 'OAuth authorization-server metadata document advertising endpoints and supported capabilities.' },
  { type: 'BaseMetadata', definedIn: '§14.1 BaseMetadata: name and title', purpose: 'Common base carrying the programmatic name and human-facing title.' },
  { type: 'BlobResourceContents', definedIn: '§14.5 ResourceContents and variants', purpose: 'Resource contents variant carrying base64-encoded binary data.' },
  { type: 'BooleanSchema', definedIn: '§20.4 The restricted form schema', purpose: 'Primitive form-field schema describing a boolean input.' },
  { type: 'CacheableResult', definedIn: '§13.1 The CacheableResult Structure', purpose: 'Result mixin carrying caching hints (ttlMs, cacheScope).' },
  { type: 'CallToolRequest', definedIn: '§16.5 Calling tools: tools/call', purpose: 'Request to invoke a tool by name with arguments.' },
  { type: 'CallToolResult', definedIn: '§16.5 Calling tools: tools/call', purpose: 'Successful tool-invocation result carrying content blocks and optional structured output.' },
  { type: 'CancelledNotification', definedIn: '§15.2.1 The notifications/cancelled notification', purpose: 'Notification that the sender is cancelling a request the sender issued earlier.' },
  { type: 'CancelledNotificationParams', definedIn: '§15.2.1 The notifications/cancelled notification', purpose: 'Parameters of the cancellation notification (target request id and optional reason).' },
  { type: 'CancelledTask', definedIn: '§25.4 Task and DetailedTask Object Types', purpose: 'DetailedTask variant for a task in the cancelled terminal state.' },
  { type: 'CancelTaskRequest', definedIn: '§25.9 Cancelling a Task: tasks/cancel', purpose: 'Request to cancel an in-progress task by taskId.' },
  { type: 'CancelTaskResult', definedIn: '§25.9 Cancelling a Task: tasks/cancel', purpose: 'Empty acknowledgement returned for a task cancellation.' },
  { type: 'ClientCapabilities', definedIn: '§6.2 ClientCapabilities', purpose: 'Capability set a client advertises to the server.' },
  { type: 'ClientIdMetadataDocument', definedIn: '§23.12 Client ID Metadata Documents', purpose: 'Client-published metadata document identified by a client-id URL.' },
  { type: 'ClientRegistrationRequest', definedIn: '§23.14 Dynamic Client Registration', purpose: 'Dynamic client registration request body.' },
  { type: 'ClientRegistrationResponse', definedIn: '§23.14 Dynamic Client Registration', purpose: 'Dynamic client registration response carrying issued client credentials.' },
  { type: 'ClientSamplingCapability', definedIn: '§21.2.3 Client Capability', purpose: 'Client capability declaring support for the deprecated sampling input-request kind.' },
  { type: 'CompletedTask', definedIn: '§25.4 Task and DetailedTask Object Types', purpose: 'DetailedTask variant for a task in the completed terminal state.' },
  { type: 'CompleteRequest', definedIn: '§19.2 completion/complete request', purpose: 'Request for completion suggestions for a prompt or resource-template argument.' },
  { type: 'CompleteRequestParams', definedIn: '§19.2 completion/complete request', purpose: 'Parameters of a completion request (reference, argument, context).' },
  { type: 'CompleteResult', definedIn: '§19.4 CompleteResult', purpose: 'Completion result carrying candidate values and totals.' },
  { type: 'CompletionsCapability', definedIn: '§19.1 The completions capability', purpose: 'Server capability declaring support for argument completion.' },
  { type: 'ContentBlock', definedIn: '§14.4 ContentBlock', purpose: 'Discriminated union of content block kinds exchanged in messages and results.' },
  { type: 'CreateMessageRequest', definedIn: '§21.2.4 Request Parameters', purpose: 'Deprecated sampling request asking the client to produce a model message.' },
  { type: 'CreateMessageRequestParams', definedIn: '§21.2.4 Request Parameters', purpose: 'Parameters of the deprecated sampling request (messages, model preferences, tools).' },
  { type: 'CreateMessageResult', definedIn: '§21.2.8 Result', purpose: 'Result of the deprecated sampling request carrying the generated message.' },
  { type: 'CreateTaskResult', definedIn: '§25.3 Task Augmentation of Existing Requests', purpose: 'Task-handle result (resultType: "task") returned in place of an ordinary result.' },
  { type: 'Cursor', definedIn: '§3.7 Base Request and Notification Params', purpose: 'Opaque pagination cursor string.' },
  { type: 'DetailedTask', definedIn: '§25.4 Task and DetailedTask Object Types', purpose: 'Discriminated union of task objects with status-specific fields.' },
  { type: 'DiscoverRequest', definedIn: '§5.3.1 Request', purpose: 'Request for server discovery and protocol-revision negotiation.' },
  { type: 'DiscoverResult', definedIn: '§5.3.2 Result', purpose: 'Result of server/discover carrying the negotiated revision and capabilities.' },
  { type: 'DiscoverResultResponse', definedIn: '§5.3.2 Result', purpose: 'Success-response envelope wrapping a DiscoverResult.' },
  { type: 'ElicitRequest', definedIn: '§20.2 Delivery via input-required result', purpose: 'Input-request asking the client to collect user input via form or URL.' },
  { type: 'ElicitRequestFormParams', definedIn: '§20.3 Elicitation modes and parameter shapes', purpose: 'Form-mode elicitation parameters carrying the requested schema.' },
  { type: 'ElicitRequestParams', definedIn: '§20.2 Delivery via input-required result', purpose: 'Union of form-mode and URL-mode elicitation parameter shapes.' },
  { type: 'ElicitRequestURLParams', definedIn: '§20.3 Elicitation modes and parameter shapes', purpose: 'URL-mode elicitation parameters carrying the out-of-band URL and id.' },
  { type: 'ElicitResult', definedIn: '§20.5 ElicitResult and response actions', purpose: 'Elicitation response carrying the user action and any collected content.' },
  { type: 'EmbeddedResource', definedIn: '§14.4.5 EmbeddedResource', purpose: 'Content block embedding resource contents inline.' },
  { type: 'EmptyResult', definedIn: '§3.9 Empty Result', purpose: 'Result type with no fields beyond the base, used for bare acknowledgements.' },
  { type: 'EnumSchema', definedIn: '§20.4 The restricted form schema', purpose: 'Union of enumerated (single/multi-select) primitive form-field schemas.' },
  { type: 'Error', definedIn: '§3.8 Error Object', purpose: 'JSON-RPC error object (code, message, optional data).' },
  { type: 'ExtensionSettings', definedIn: '§24.3 Negotiation', purpose: 'Per-extension settings map carried during extension negotiation.' },
  { type: 'FailedTask', definedIn: '§25.4 Task and DetailedTask Object Types', purpose: 'DetailedTask variant for a task in the failed terminal state.' },
  { type: 'GetPromptRequest', definedIn: '§18.4 Getting a prompt: prompts/get', purpose: 'Request to resolve a prompt by name with arguments.' },
  { type: 'GetPromptResult', definedIn: '§18.4 Getting a prompt: prompts/get', purpose: 'Resolved prompt result carrying the message list.' },
  { type: 'GetTaskRequest', definedIn: '§25.7 Retrieving a Task: tasks/get', purpose: "Request to retrieve a task's current detailed state by taskId." },
  { type: 'GetTaskResult', definedIn: '§25.7 Retrieving a Task: tasks/get', purpose: 'Result carrying a DetailedTask for the requested task.' },
  { type: 'Icon', definedIn: '§14.2 Icon and Icons', purpose: 'Single icon descriptor (source, optional MIME type and size).' },
  { type: 'Icons', definedIn: '§14.2 Icon and Icons', purpose: 'Collection of icon descriptors.' },
  { type: 'ImageContent', definedIn: '§14.4.2 ImageContent', purpose: 'Content block carrying base64-encoded image data with a MIME type.' },
  { type: 'Implementation', definedIn: '§14.3 Implementation', purpose: 'Descriptor identifying an implementation (name, title, version).' },
  { type: 'InputRequest', definedIn: '§11.2 InputRequiredResult and the Input Requests', purpose: 'Discriminated union of input-request kinds a server may ask a client to fulfill.' },
  { type: 'InputRequests', definedIn: '§11.2 InputRequiredResult and the Input Requests', purpose: 'Map from server-chosen key to a single InputRequest.' },
  { type: 'InputRequiredResult', definedIn: '§11.2 InputRequiredResult and the Input Requests', purpose: 'Result (resultType: "input_required") requesting further client input.' },
  { type: 'InputRequiredTask', definedIn: '§25.4 Task and DetailedTask Object Types', purpose: 'DetailedTask variant for a task awaiting client input.' },
  { type: 'InputResponse', definedIn: '§11.4 The Retry Request: InputResponseRequestParams', purpose: 'Discriminated union of input-response kinds answering an InputRequest.' },
  { type: 'InputResponseRequestParams', definedIn: '§11.4 The Retry Request: InputResponseRequestParams', purpose: 'Retry parameters carrying inputResponses and the echoed requestState.' },
  { type: 'InputResponses', definedIn: '§11.4 The Retry Request: InputResponseRequestParams', purpose: 'Map from key to InputResponse, answering the corresponding inputRequests.' },
  { type: 'JSONArray', definedIn: '§2.3 JSON Value Model', purpose: 'Ordered list of JSON values.' },
  { type: 'JSONObject', definedIn: '§2.3 JSON Value Model', purpose: 'Unordered, string-keyed map of JSON values.' },
  { type: 'JSONRPCErrorResponse', definedIn: '§3.5.2 Error Response', purpose: 'JSON-RPC error response envelope.' },
  { type: 'JSONRPCMessage', definedIn: '§3.1 JSON-RPC Framing', purpose: 'Union of all framed JSON-RPC message kinds.' },
  { type: 'JSONRPCNotification', definedIn: '§3.4 Notifications', purpose: 'JSON-RPC notification envelope (no id).' },
  { type: 'JSONRPCRequest', definedIn: '§3.3 Requests', purpose: 'JSON-RPC request envelope (with id).' },
  { type: 'JSONRPCResponse', definedIn: '§3.5 Responses', purpose: 'Union of success and error response envelopes.' },
  { type: 'JSONRPCResultResponse', definedIn: '§3.5.1 Success Response', purpose: 'JSON-RPC success response envelope carrying a result.' },
  { type: 'JSONValue', definedIn: '§2.3 JSON Value Model', purpose: 'Any JSON value (null, boolean, number, string, array, object).' },
  { type: 'LegacyTitledEnumSchema', definedIn: '§20.4 The restricted form schema', purpose: 'Deprecated enum form-field schema using a parallel enumNames array.' },
  { type: 'ListPromptsRequest', definedIn: '§18.2 Listing prompts: prompts/list', purpose: 'Paginated request to list available prompts.' },
  { type: 'ListPromptsResult', definedIn: '§18.2 Listing prompts: prompts/list', purpose: 'Paginated result listing prompts.' },
  { type: 'ListResourcesRequest', definedIn: '§17.2 Listing resources: resources/list', purpose: 'Paginated request to list available resources.' },
  { type: 'ListResourcesResult', definedIn: '§17.2 Listing resources: resources/list', purpose: 'Paginated, cacheable result listing resources.' },
  { type: 'ListResourceTemplatesRequest', definedIn: '§17.3 Listing resource templates: resources/templates/list', purpose: 'Paginated request to list resource templates.' },
  { type: 'ListResourceTemplatesResult', definedIn: '§17.3 Listing resource templates: resources/templates/list', purpose: 'Paginated, cacheable result listing resource templates.' },
  { type: 'ListRootsRequest', definedIn: '§21.1.4 The roots/list Input Request', purpose: 'Deprecated input-request asking the client for its root list.' },
  { type: 'ListRootsResult', definedIn: '§21.1.5 The ListRootsResult and the Root Type', purpose: 'Result of the deprecated roots listing.' },
  { type: 'ListToolsRequest', definedIn: '§16.2 Listing tools: tools/list', purpose: 'Paginated request to list available tools.' },
  { type: 'ListToolsResult', definedIn: '§16.2 Listing tools: tools/list', purpose: 'Paginated result listing tools.' },
  { type: 'LoggingLevel', definedIn: '§15.3.1 The LoggingLevel enumeration', purpose: 'Enumeration of syslog-style log severity levels.' },
  { type: 'LoggingMessageNotification', definedIn: '§15.3.2 The notifications/message notification', purpose: 'Notification carrying a log message from server to client.' },
  { type: 'LoggingMessageNotificationParams', definedIn: '§15.3.2 The notifications/message notification', purpose: 'Parameters of a logging notification (level, logger, data).' },
  { type: 'MetaObject', definedIn: '§4.1 The _meta Object', purpose: 'Open string-keyed metadata map carried in _meta.' },
  { type: 'MissingRequiredClientCapabilityError', definedIn: '§22.3.1 -32003 MissingRequiredClientCapability', purpose: 'Error payload reporting a required client capability that was not declared.' },
  { type: 'ModelHint', definedIn: '§21.2.9 Model Preferences', purpose: 'Hint guiding model selection during deprecated sampling.' },
  { type: 'ModelPreferences', definedIn: '§21.2.9 Model Preferences', purpose: 'Model-selection preferences for deprecated sampling.' },
  { type: 'Notification', definedIn: '§3.4 Notifications', purpose: 'Base shape of a notification (method and optional params).' },
  { type: 'NotificationParams', definedIn: '§3.7 Base Request and Notification Params', purpose: 'Base parameters shape common to notifications.' },
  { type: 'NumberSchema', definedIn: '§20.4 The restricted form schema', purpose: 'Primitive form-field schema describing a numeric input.' },
  { type: 'OpenLinkParams', definedIn: '§26.5.3 Tool-invocation and other requests (UI → Host)', purpose: 'UI-to-host request parameters to open an external link.' },
  { type: 'PaginatedRequestParams', definedIn: '§12.2 Request and Result Shapes', purpose: 'Base request parameters carrying an optional cursor.' },
  { type: 'PaginatedResult', definedIn: '§12.2 Request and Result Shapes', purpose: 'Base result carrying an optional nextCursor.' },
  { type: 'PrimitiveSchemaDefinition', definedIn: '§20.4 The restricted form schema', purpose: 'Union of primitive form-field schema kinds (string, number, boolean, enum).' },
  { type: 'ProgressNotification', definedIn: '§15.1.3 The notifications/progress notification', purpose: 'Notification reporting progress on a long-running request.' },
  { type: 'ProgressNotificationParams', definedIn: '§15.1.3 The notifications/progress notification', purpose: 'Parameters of a progress notification (token, progress, total, message).' },
  { type: 'ProgressToken', definedIn: '§3.7 Base Request and Notification Params', purpose: 'Token correlating progress notifications with a request.' },
  { type: 'Prompt', definedIn: '§18.3 The Prompt and PromptArgument types', purpose: 'Descriptor of an available prompt and its arguments.' },
  { type: 'PromptArgument', definedIn: '§18.3 The Prompt and PromptArgument types', purpose: 'Descriptor of a single prompt argument.' },
  { type: 'PromptListChangedNotification', definedIn: '§18.6 The prompts-list-changed notification', purpose: 'Notification that the prompt list has changed.' },
  { type: 'PromptMessage', definedIn: '§18.5 The PromptMessage type and valid content', purpose: 'Single message within a resolved prompt.' },
  { type: 'PromptReference', definedIn: '§19.3 Reference types: PromptReference and ResourceTemplateReference', purpose: 'Completion reference identifying a prompt.' },
  { type: 'PromptsCapability', definedIn: '§18.1 The prompts capability', purpose: 'Server capability declaring support for prompts.' },
  { type: 'ProtectedResourceMetadata', definedIn: '§23.2 Protected Resource Metadata Discovery', purpose: "Metadata document advertising the resource server's authorization servers." },
  { type: 'ReadResourceRequest', definedIn: '§17.5 Reading a resource: resources/read', purpose: 'Request to read a resource by URI.' },
  { type: 'ReadResourceRequestParams', definedIn: '§17.5 Reading a resource: resources/read', purpose: 'Parameters of a resource-read request (URI plus input responses).' },
  { type: 'ReadResourceResult', definedIn: '§17.5 Reading a resource: resources/read', purpose: "Cacheable result carrying the read resource's contents." },
  { type: 'Request', definedIn: '§3.3 Requests', purpose: 'Base shape of a request (method and optional params).' },
  { type: 'RequestId', definedIn: '§3.2 Request Identifier', purpose: 'Request-correlation identifier (string or number).' },
  { type: 'RequestMetaObject', definedIn: '§4.3 Protocol-Defined Per-Request _meta Keys', purpose: '_meta shape for protocol-defined per-request metadata keys.' },
  { type: 'RequestParams', definedIn: '§3.7 Base Request and Notification Params', purpose: 'Base parameters shape common to requests, carrying _meta.' },
  { type: 'RequestProtocolVersionMeta', definedIn: '§5.2 Carrying the Protocol Revision on a Request', purpose: '_meta shape carrying the protocol revision on a request.' },
  { type: 'Resource', definedIn: '§17.4 The Resource and ResourceTemplate types', purpose: 'Descriptor of a concrete resource.' },
  { type: 'ResourceContents', definedIn: '§14.5 ResourceContents and variants', purpose: 'Base of the resource-contents variants (text/blob).' },
  { type: 'ResourceLink', definedIn: '§14.4.4 ResourceLink', purpose: 'Content block referencing a resource by URI.' },
  { type: 'ResourceListChangedNotification', definedIn: '§17.7 Change notifications and subscriptions', purpose: 'Notification that the resource list has changed.' },
  { type: 'ResourceNotFoundError', definedIn: '§17.6 Resource-not-found error', purpose: 'Error payload reporting that a requested resource URI was not found.' },
  { type: 'ResourcesServerCapability', definedIn: '§17.1 The resources capability', purpose: 'Server capability declaring support for resources (and subscription flags).' },
  { type: 'ResourceTeardownParams', definedIn: '§26.5.4 Lifecycle and context-change messages (Host → UI)', purpose: 'Host-to-UI parameters signalling that the UI resource is being torn down.' },
  { type: 'ResourceTemplate', definedIn: '§17.4 The Resource and ResourceTemplate types', purpose: 'Descriptor of a parameterized resource URI template.' },
  { type: 'ResourceTemplateReference', definedIn: '§19.3 Reference types: PromptReference and ResourceTemplateReference', purpose: 'Completion reference identifying a resource template.' },
  { type: 'ResourceUiMeta', definedIn: '§26.4 The UI Resource', purpose: 'UI metadata (CSP, permissions) attached to a UI resource.' },
  { type: 'ResourceUpdatedNotification', definedIn: '§17.7 Change notifications and subscriptions', purpose: 'Notification that a subscribed resource has been updated.' },
  { type: 'ResourceUpdatedNotificationParams', definedIn: '§17.7 Change notifications and subscriptions', purpose: 'Parameters of a resource-updated notification (URI).' },
  { type: 'Result', definedIn: '§3.6 Result Base Type', purpose: 'Base of all result types, carrying resultType and _meta.' },
  { type: 'ResultType', definedIn: '§3.6 Result Base Type', purpose: 'Open discriminator selecting the concrete result shape.' },
  { type: 'Role', definedIn: '§14.7 Role', purpose: 'Message-author role (user or assistant).' },
  { type: 'Root', definedIn: '§21.1.5 The ListRootsResult and the Root Type', purpose: 'Deprecated descriptor of a client-exposed filesystem root.' },
  { type: 'SamplingMessage', definedIn: '§21.2.6 Messages and Content Blocks', purpose: 'Single message in a deprecated sampling conversation.' },
  { type: 'SamplingMessageContentBlock', definedIn: '§21.2.6 Messages and Content Blocks', purpose: 'Content-block union for sampling messages (text/image/audio plus tool_use/tool_result; excludes resource_link and resource).' },
  { type: 'SandboxResourceReadyParams', definedIn: '§26.5.5 Host-internal sandbox-proxy messages', purpose: 'Host-internal sandbox-proxy parameters signalling the UI resource is ready.' },
  { type: 'ServerCapabilities', definedIn: '§6.3 ServerCapabilities', purpose: 'Capability set a server advertises to the client.' },
  { type: 'SingleSelectEnumSchema', definedIn: '§20.4 The restricted form schema', purpose: 'Union of single-select enum form-field schema variants.' },
  { type: 'SizeChangedParams', definedIn: '§26.5.4 Lifecycle and context-change messages (Host → UI)', purpose: 'Host-to-UI parameters reporting a UI size change.' },
  { type: 'StringSchema', definedIn: '§20.4 The restricted form schema', purpose: 'Primitive form-field schema describing a string input.' },
  { type: 'SubscriptionFilter', definedIn: '§10.2 The subscriptions/listen Request and the Notification Filter', purpose: 'Filter selecting which notification kinds a subscription delivers.' },
  { type: 'SubscriptionsAcknowledgedNotification', definedIn: '§10.3 Acknowledgement', purpose: 'Notification acknowledging an established subscription.' },
  { type: 'SubscriptionsAcknowledgedNotificationParams', definedIn: '§10.3 Acknowledgement', purpose: 'Parameters of the subscription-acknowledgement notification.' },
  { type: 'SubscriptionsListenRequest', definedIn: '§10.2 The subscriptions/listen Request and the Notification Filter', purpose: 'Request to open a server-to-client notification stream.' },
  { type: 'SubscriptionsListenRequestParams', definedIn: '§10.2 The subscriptions/listen Request and the Notification Filter', purpose: 'Parameters of the subscription-listen request (filter).' },
  { type: 'Task', definedIn: '§25.4 Task and DetailedTask Object Types', purpose: 'Core task object (id, status, timestamps) shared by all task variants.' },
  { type: 'TaskStatus', definedIn: '§25.5 Task Status Lifecycle', purpose: 'Enumeration of task lifecycle states.' },
  { type: 'TaskStatusNotification', definedIn: '§25.10 Task Status Notifications: notifications/tasks', purpose: "Notification reporting a task's status change." },
  { type: 'TaskStatusNotificationParams', definedIn: '§25.10 Task Status Notifications: notifications/tasks', purpose: 'Parameters of a task-status notification (a DetailedTask).' },
  { type: 'TasksExtensionCapability', definedIn: '§25.2 Capability Declaration and Negotiation', purpose: 'Capability declaring support for the Tasks extension.' },
  { type: 'TextContent', definedIn: '§14.4.1 TextContent', purpose: 'Content block carrying plain text.' },
  { type: 'TextResourceContents', definedIn: '§14.5 ResourceContents and variants', purpose: 'Resource contents variant carrying text.' },
  { type: 'TitledMultiSelectEnumSchema', definedIn: '§20.4 The restricted form schema', purpose: 'Multi-select enum form-field schema with per-option titles.' },
  { type: 'TitledSingleSelectEnumSchema', definedIn: '§20.4 The restricted form schema', purpose: 'Single-select enum form-field schema with per-option titles.' },
  { type: 'Tool', definedIn: '§16.3 The Tool type', purpose: 'Descriptor of an available tool (name, schemas, annotations).' },
  { type: 'ToolAnnotations', definedIn: '§16.7 Tool annotations', purpose: 'Behavioral hints about a tool (read-only, destructive, idempotent, etc.).' },
  { type: 'ToolCancelledParams', definedIn: '§26.5.2 Tool input and result delivery (Host → UI)', purpose: 'Host-to-UI parameters signalling a tool invocation was cancelled.' },
  { type: 'ToolChoice', definedIn: '§21.2.5 Tool Choice', purpose: 'Deprecated sampling control selecting how tools may be used.' },
  { type: 'ToolInputParams', definedIn: '§26.5.2 Tool input and result delivery (Host → UI)', purpose: 'Host-to-UI parameters delivering tool input arguments.' },
  { type: 'ToolListChangedNotification', definedIn: '§16.8 The notifications/tools/list_changed notification', purpose: 'Notification that the tool list has changed.' },
  { type: 'ToolResultContent', definedIn: '§21.2.6 Messages and Content Blocks', purpose: 'Sampling content block carrying a tool result.' },
  { type: 'ToolResultParams', definedIn: '§26.5.2 Tool input and result delivery (Host → UI)', purpose: 'Host-to-UI parameters delivering a tool result.' },
  { type: 'ToolsCallParams', definedIn: '§26.5.3 Tool-invocation and other requests (UI → Host)', purpose: 'UI-to-host parameters requesting a tool invocation.' },
  { type: 'ToolsCapability', definedIn: '§16.1 The tools server capability', purpose: 'Server capability declaring support for tools.' },
  { type: 'ToolUiMeta', definedIn: '§26.3 Declaring a UI on a Tool', purpose: 'UI metadata declaring an interactive UI on a tool.' },
  { type: 'ToolUseContent', definedIn: '§21.2.6 Messages and Content Blocks', purpose: 'Sampling content block carrying a tool-use request.' },
  { type: 'TraceContextMeta', definedIn: '§15.4.1 Reserved trace-context metadata keys', purpose: '_meta shape carrying W3C trace-context fields.' },
  { type: 'UiContentSecurityPolicy', definedIn: '§26.4 The UI Resource', purpose: 'Content-security-policy descriptor for a UI resource.' },
  { type: 'UiHostContext', definedIn: '§26.5.1 Initialization handshake', purpose: 'Host rendering context (theme, display mode, styles) supplied to a UI.' },
  { type: 'UiHostExtensionCapability', definedIn: '§26.2 Extension Identifier and Capability Negotiation', purpose: 'Capability declaring support for the interactive user-interface extension.' },
  { type: 'UiInitializeParams', definedIn: '§26.5.1 Initialization handshake', purpose: 'UI-to-host initialization request parameters.' },
  { type: 'UiInitializeResult', definedIn: '§26.5.1 Initialization handshake', purpose: 'Host-to-UI initialization result (granted permissions, CSP, host context).' },
  { type: 'UiMessageParams', definedIn: '§26.5.3 Tool-invocation and other requests (UI → Host)', purpose: 'UI-to-host parameters carrying a user-facing message.' },
  { type: 'UiPermissions', definedIn: '§26.4 The UI Resource', purpose: 'Sandbox permission set requested or granted for a UI resource.' },
  { type: 'UnsupportedProtocolVersionError', definedIn: '§22.3.2 -32004 UnsupportedProtocolVersion', purpose: 'Error payload reporting that no mutually supported protocol revision exists.' },
  { type: 'UntitledMultiSelectEnumSchema', definedIn: '§20.4 The restricted form schema', purpose: 'Multi-select enum form-field schema without per-option titles.' },
  { type: 'UntitledSingleSelectEnumSchema', definedIn: '§20.4 The restricted form schema', purpose: 'Single-select enum form-field schema without per-option titles.' },
  { type: 'UpdateModelContextParams', definedIn: '§26.5.3 Tool-invocation and other requests (UI → Host)', purpose: 'UI-to-host parameters updating the model-visible context.' },
  { type: 'UpdateTaskRequest', definedIn: '§25.8 Supplying Input to a Task: tasks/update', purpose: 'Request supplying input responses to an in-progress task.' },
  { type: 'UpdateTaskResult', definedIn: '§25.8 Supplying Input to a Task: tasks/update', purpose: 'Empty acknowledgement returned for a task update.' },
  { type: 'WorkingTask', definedIn: '§25.4 Task and DetailedTask Object Types', purpose: 'DetailedTask variant for a task in the working state.' },
];

/**
 * Looks up the Appendix E entry for a wire `type` name, or `undefined` when the
 * type is not in the index. (Appendix E)
 */
export function lookupType(type: string): TypeIndexEntry | undefined {
  return TYPE_REGISTRY.find((entry) => entry.type === type);
}

/**
 * The set of reserved error codes the §22 / Appendix B registry pins (the eight
 * codes a custom code MUST NOT collide with). Surfaced as a convenience set so a
 * caller need not derive it from {@link RESERVED_ERROR_CODES}; the `-32001`
 * HeaderMismatch member is the one that lies inside the `-32000..-32099` range.
 * (R-AppB-a, R-AppB-b)
 */
export const APPENDIX_B_RESERVED_CODE_SET: ReadonlySet<number> = new Set(RESERVED_ERROR_CODES);

/**
 * Returns `true` when `code` is a code the document already defines in Appendix
 * B — i.e. a code a custom definition MUST avoid. A `true` result means a custom
 * code that equals it is non-conformant. (R-AppB-a, AC-46.1)
 *
 * This consults the full {@link ERROR_CODE_REGISTRY} so it catches every listed
 * code (including the resource-not-found legacy literal), not only the eight in
 * {@link RESERVED_ERROR_CODES}. The `-32001` HeaderMismatch code is included.
 */
export function isErrorCodeDefinedByDocument(code: number): boolean {
  return APPENDIX_B_RESERVED_CODE_SET.has(code)
    || code === HEADER_MISMATCH_CODE
    || Object.prototype.hasOwnProperty.call(ERROR_CODE_REGISTRY, code);
}
