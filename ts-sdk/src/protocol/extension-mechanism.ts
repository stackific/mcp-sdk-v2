/**
 * S38 — The Extension Mechanism (§24).
 *
 * The framework by which functionality beyond the core protocol is added,
 * negotiated, and used. S11 (`extensions.ts`) owns the lexical layer — the
 * extension-identifier grammar, the `extensions` map / settings-object shapes,
 * normalization, the activation-by-intersection primitive, and the
 * forward-compatibility helpers. This module builds the *mechanism* on top of
 * those primitives:
 *
 *   - the third-party reservation policy applied to whole identifiers
 *     ({@link isValidThirdPartyExtensionId} / {@link validateThirdPartyExtensionId}),
 *     including the bare-token (`modelcontextprotocol` / `mcp`) prohibition;
 *   - the per-request active set ({@link computeActiveSet}) and the stateless
 *     "recompute from this request only, never infer from a prior one" rule
 *     ({@link activeSetForRequest});
 *   - the four — and only four — ways an active extension may extend the
 *     surface ({@link EXTENSION_SURFACE_CHANNELS}, {@link ExtensionDefinition}),
 *     with a no-redefinition guard against core surface;
 *   - method/notification namespacing derived from the identifier
 *     ({@link deriveExtensionNamespace}, {@link isMethodInExtensionNamespace})
 *     and an active-set-gated dispatcher ({@link ExtensionMethodRouter});
 *   - extension-controlled reserved `_meta` keys
 *     ({@link isExtensionControlledMetaKey});
 *   - the open `resultType` set: core values plus active-extension contributions
 *     ({@link acceptedResultTypes} / {@link isResultTypeAccepted});
 *   - extension versioning discoverable through the settings object
 *     ({@link getExtensionVersion}) and the new-identifier rule for incompatible
 *     change ({@link suggestSuccessorIdentifier});
 *   - graceful degradation: the fallback decision and an actionable
 *     required-but-absent error ({@link buildRequiredExtensionError}).
 *
 * REUSE (never redefined here):
 *   - identifier grammar & reserved-prefix policy, `ExtensionsMap`,
 *     `ExtensionSettings`, `normalizeExtensionsMap`, `intersectExtensions`,
 *     `isExtensionActive`, `decideExtensionFallback` — `./extensions.js` (S11);
 *   - `RESULT_TYPE` / `isKnownResultType` — `../jsonrpc/payload.js` (S04);
 *   - `_meta` prefix grammar / reserved-prefix rule — `../json/meta-key.js` (S02);
 *   - `INVALID_PARAMS_CODE`, `MISSING_CLIENT_CAPABILITY_CODE` — `./meta.js` (S05).
 *
 * Out of scope (owned elsewhere, per the story):
 *   - the `ClientCapabilities` / `ServerCapabilities` shapes and per-request
 *     capability gating — S10 (`capability-negotiation.ts`);
 *   - the `extensions` map field structure / grammar — S11 (`extensions.ts`);
 *   - the `_meta` envelope and `io.modelcontextprotocol/clientCapabilities`
 *     delivery — S05/S06; `server/discover` result delivery — S08;
 *   - the concrete Tasks (§25) and UI (§26) extensions — S39–S42;
 *   - the Deprecated state model — S43.
 */

import {
  RESULT_TYPE,
  isKnownResultType,
} from '../jsonrpc/payload.js';
import {
  isValidMetaKeyPrefix,
  parseMetaKey,
  isValidMetaKeyName,
} from '../json/meta-key.js';
import { INVALID_PARAMS_CODE, MISSING_CLIENT_CAPABILITY_CODE } from './meta.js';
import {
  parseExtensionId,
  isValidExtensionId,
  isValidExtensionPrefix,
  isValidExtensionName,
  isReservedExtensionPrefix,
  isExtensionAdvertised,
  getExtensionSettings,
  intersectExtensions,
  isExtensionActive,
  decideExtensionFallback,
  type ExtensionsMap,
  type ExtensionSettings,
  type ExtensionFallbackDecision,
} from './extensions.js';

// Re-export the S11 lexical / negotiation primitives this mechanism builds on,
// so a consumer of the mechanism can reach them through one module without
// importing `extensions.js` directly. These are NOT redefined — they are the
// canonical S11 bindings. (§24.2, §24.3)
export {
  parseExtensionId,
  isValidExtensionId,
  isExtensionActive,
  intersectExtensions,
  decideExtensionFallback,
  type ExtensionsMap,
  type ExtensionSettings,
  type ExtensionFallbackDecision,
};

// ─── §24.2 — Third-party identifier policy (whole-identifier rules) ─────────────

/** The bare tokens reserved to the core protocol; a third party MUST NOT use
 * either as a vendor prefix. (R-24.2-f) */
const RESERVED_BARE_VENDOR_TOKENS = new Set(['modelcontextprotocol', 'mcp']);

/**
 * Returns `true` when a vendor prefix is one of the bare reserved tokens
 * `modelcontextprotocol` or `mcp` (a single-label prefix with no dot). (R-24.2-f)
 *
 * This is distinct from {@link isReservedExtensionPrefix} (S11), which reserves a
 * prefix whose *second* label is reserved (e.g. `io.modelcontextprotocol`); a
 * bare single-label prefix has no second label, so that check alone would miss
 * `modelcontextprotocol/x` and `mcp/x`.
 */
export function isReservedBareVendorPrefix(prefix: string): boolean {
  return RESERVED_BARE_VENDOR_TOKENS.has(prefix);
}

/** Why a third party may not use an extension identifier. */
export type ThirdPartyIdRejection =
  /** No `/`-terminated vendor prefix — a bare name. (R-24.2-a) */
  | 'missing-prefix'
  /** A prefix label or the name breaks the lexical grammar. (R-24.2-b, R-24.2-d) */
  | 'malformed'
  /** The prefix's second label is `modelcontextprotocol`/`mcp`. (R-24.2-e) */
  | 'reserved-prefix'
  /** The bare token `modelcontextprotocol`/`mcp` used as the prefix. (R-24.2-f) */
  | 'reserved-bare-token';

/** Outcome of {@link validateThirdPartyExtensionId}. */
export type ThirdPartyIdValidation =
  | { ok: true }
  | { ok: false; reason: ThirdPartyIdRejection };

/**
 * Validates an extension identifier *as a third-party identifier*, returning the
 * specific reason on failure. (R-24.2-a, R-24.2-b, R-24.2-d, R-24.2-e, R-24.2-f)
 *
 * A third-party identifier MUST: include a `/`-terminated vendor prefix; have
 * every prefix label and the name conform to the §24.2 grammar; and NOT use a
 * reserved prefix — neither one whose second label is `modelcontextprotocol`/`mcp`
 * (e.g. `io.modelcontextprotocol/x`, `com.mcp.tools/x`) nor the bare tokens
 * `modelcontextprotocol`/`mcp` used as a single-label prefix. `com.example.mcp/x`
 * is allowed (its second label is `example`).
 *
 * Identifiers are compared octet-for-octet; case folding is never applied, so
 * `Com.Example/Ext` and `com.example/ext` are distinct. (R-24.2-g)
 */
export function validateThirdPartyExtensionId(identifier: string): ThirdPartyIdValidation {
  const parsed = parseExtensionId(identifier);
  if (parsed === undefined) return { ok: false, reason: 'missing-prefix' };
  if (parsed.prefix.length === 0) return { ok: false, reason: 'missing-prefix' };
  if (!isValidExtensionPrefix(parsed.prefix) || !isValidExtensionName(parsed.name)) {
    return { ok: false, reason: 'malformed' };
  }
  if (isReservedBareVendorPrefix(parsed.prefix)) {
    return { ok: false, reason: 'reserved-bare-token' };
  }
  if (isReservedExtensionPrefix(parsed.prefix)) {
    return { ok: false, reason: 'reserved-prefix' };
  }
  return { ok: true };
}

/**
 * Returns `true` when a THIRD PARTY may define an extension under `identifier`:
 * well-formed, not under a reserved second-label prefix, and not using a bare
 * reserved vendor token. (R-24.2-a, R-24.2-b, R-24.2-d, R-24.2-e, R-24.2-f)
 *
 * Unlike S11's `isThirdPartyUsable`, this additionally rejects the bare tokens
 * `modelcontextprotocol`/`mcp` as single-label prefixes (R-24.2-f), which the
 * second-label rule alone does not catch.
 */
export function isValidThirdPartyExtensionId(identifier: string): boolean {
  return validateThirdPartyExtensionId(identifier).ok;
}

/**
 * Compares two extension identifiers octet-for-octet, applying NO case folding.
 * (R-24.2-g) Returns `true` only when the strings are byte-identical.
 */
export function extensionIdsMatch(a: string, b: string): boolean {
  return a === b;
}

// ─── §24.1 — Classification ────────────────────────────────────────────────────

/**
 * The three (non-exclusive) ways an extension may be characterized. (§24.1,
 * R-24.1-a) An extension is classifiable as one of these; the value is purely
 * descriptive and does not affect negotiation.
 *
 *   - `modular`      — a discrete capability;
 *   - `specialized`  — domain- or industry-specific behavior;
 *   - `experimental` — incubated for possible future inclusion in the core.
 */
export type ExtensionClassification = 'modular' | 'specialized' | 'experimental';

/** The full set of valid {@link ExtensionClassification} values. */
export const EXTENSION_CLASSIFICATIONS: readonly ExtensionClassification[] = [
  'modular',
  'specialized',
  'experimental',
];

/** Returns `true` when `value` is a recognized {@link ExtensionClassification}. */
export function isExtensionClassification(value: unknown): value is ExtensionClassification {
  return value === 'modular' || value === 'specialized' || value === 'experimental';
}

// ─── §24.5 — The four surface channels ─────────────────────────────────────────

/**
 * The four — and ONLY four — channels through which an active extension may
 * extend the protocol surface. (§24.5, R-24.5-a) Adding surface through any
 * other channel is non-conformant.
 *
 *   - `method`          — additional request methods and notifications (R-24.5-b);
 *   - `meta-key`        — additional reserved `_meta` keys under a controlled
 *                         vendor prefix (R-24.5-d);
 *   - `result-type`     — additional `resultType` discriminator values (R-24.5-e);
 *   - `field`           — additional fields on existing objects (R-24.5-g).
 */
export type ExtensionSurfaceChannel = 'method' | 'meta-key' | 'result-type' | 'field';

/** The four sanctioned surface channels, in spec order. (R-24.5-a) */
export const EXTENSION_SURFACE_CHANNELS: readonly ExtensionSurfaceChannel[] = [
  'method',
  'meta-key',
  'result-type',
  'field',
];

/** Returns `true` when `channel` is one of the four sanctioned surface channels. (R-24.5-a) */
export function isSanctionedSurfaceChannel(channel: unknown): channel is ExtensionSurfaceChannel {
  return (
    channel === 'method' ||
    channel === 'meta-key' ||
    channel === 'result-type' ||
    channel === 'field'
  );
}

// ─── §24.5(1) — Method / notification namespacing ──────────────────────────────

/**
 * Derives the method namespace prefix an extension owns from its identifier's
 * NAME segment. (R-24.5-b)
 *
 * The §24.5 examples show the Tasks extension (`io.modelcontextprotocol/tasks`)
 * defining methods such as `tasks/get` — i.e. the namespace is the identifier's
 * extension-name followed by `/`. This derives `"tasks/"` from
 * `"io.modelcontextprotocol/tasks"` so a definition can both *mint* and
 * *recognize* its own method strings consistently.
 *
 * Returns `undefined` when `identifier` is not a well-formed extension identifier
 * or its name is empty (an empty name yields no usable namespace).
 */
export function deriveExtensionNamespace(identifier: string): string | undefined {
  const parsed = parseExtensionId(identifier);
  if (parsed === undefined) return undefined;
  if (!isValidExtensionPrefix(parsed.prefix) || !isValidExtensionName(parsed.name)) return undefined;
  if (parsed.name === '') return undefined;
  return `${parsed.name}/`;
}

/**
 * Returns `true` when `method` belongs to the namespace derived from
 * `identifier` — i.e. it begins with `<extension-name>/` and carries a non-empty
 * member segment after the slash. (R-24.5-b)
 *
 * The member segment is the part after the namespace prefix; it MUST be
 * non-empty (`tasks/` alone is not a method) but is otherwise unconstrained here.
 */
export function isMethodInExtensionNamespace(method: string, identifier: string): boolean {
  const namespace = deriveExtensionNamespace(identifier);
  if (namespace === undefined) return false;
  return method.length > namespace.length && method.startsWith(namespace);
}

/**
 * Builds a namespaced method string for an extension from its identifier and a
 * member name (e.g. `("io.modelcontextprotocol/tasks", "get") → "tasks/get"`).
 * (R-24.5-b)
 *
 * @throws {RangeError} when `identifier` yields no namespace (malformed or
 *   empty-named) or `member` is empty.
 */
export function extensionMethod(identifier: string, member: string): string {
  const namespace = deriveExtensionNamespace(identifier);
  if (namespace === undefined) {
    throw new RangeError(`Cannot derive a method namespace from "${identifier}" (R-24.5-b)`);
  }
  if (member.length === 0) {
    throw new RangeError('Extension method member name MUST be non-empty (R-24.5-b)');
  }
  return `${namespace}${member}`;
}

// ─── §24.5(2) — Extension-controlled reserved `_meta` keys ─────────────────────

/**
 * Returns `true` when `metaKey` is a reserved `_meta` key that the extension
 * identified by `identifier` is entitled to define — i.e. the key carries a
 * valid prefix that the extension controls, per the §4 prefix rules. (R-24.5-d)
 *
 * "Controls" means the key's prefix labels are the same dot-separated labels as
 * the extension identifier's vendor prefix (the part before the identifier's
 * `/`). For `io.modelcontextprotocol/ui` the controlled keys are those under
 * `io.modelcontextprotocol/…`; for `com.example/x`, under `com.example/…`.
 *
 * A core-protocol extension legitimately controls a reserved prefix (its second
 * label is `modelcontextprotocol`/`mcp`); a third-party extension's own prefix is
 * non-reserved. Either way the key is valid for THAT extension iff the labels
 * match.
 */
export function isExtensionControlledMetaKey(metaKey: string, identifier: string): boolean {
  const parsedId = parseExtensionId(identifier);
  if (parsedId === undefined || !isValidExtensionPrefix(parsedId.prefix)) return false;

  const { prefix, name } = parseMetaKey(metaKey);
  if (prefix === undefined) return false; // a bare `_meta` key controls no namespace
  if (!isValidMetaKeyPrefix(prefix)) return false;
  if (!isValidMetaKeyName(name)) return false;

  // The `_meta` prefix includes the trailing slash; the identifier prefix does
  // not. Compare the label bodies octet-for-octet (R-24.2-g / §4).
  const metaPrefixBody = prefix.slice(0, -1);
  return metaPrefixBody === parsedId.prefix;
}

/**
 * Builds a reserved `_meta` key under the extension's controlled vendor prefix.
 * (R-24.5-d) e.g. `("com.example/x", "trace") → "com.example/trace"`.
 *
 * @throws {RangeError} when `identifier` is malformed or `name` is not a valid
 *   `_meta` key name.
 */
export function extensionMetaKey(identifier: string, name: string): string {
  const parsedId = parseExtensionId(identifier);
  if (parsedId === undefined || !isValidExtensionPrefix(parsedId.prefix)) {
    throw new RangeError(`Cannot derive a _meta prefix from "${identifier}" (R-24.5-d)`);
  }
  if (name === '' || !isValidMetaKeyName(name)) {
    throw new RangeError(`"${name}" is not a valid _meta key name (R-24.5-d)`);
  }
  return `${parsedId.prefix}/${name}`;
}

// ─── §24.5(3) — The open `resultType` set ──────────────────────────────────────

/**
 * The core-protocol `resultType` discriminator values, frozen. (§3.6 / S04)
 * The accepted set for any interaction is these PLUS the values contributed by
 * active extensions. (R-24.5-e)
 */
export const CORE_RESULT_TYPE_VALUES: readonly string[] = Object.freeze([
  RESULT_TYPE.COMPLETE,
  RESULT_TYPE.INPUT_REQUIRED,
]);

/**
 * Returns the set of `resultType` values a receiver will accept for an
 * interaction: the core values together with every value contributed by an
 * extension in `activeContributions` that is also in `activeSet`. (R-24.5-e)
 *
 * Contributions from a NON-active extension are excluded — a `resultType`
 * defined by an inactive extension is never accepted. (R-24.5-f)
 *
 * @param activeSet            - Identifiers active for this interaction (e.g.
 *   from {@link computeActiveSet}).
 * @param activeContributions  - Map of extension identifier → the `resultType`
 *   values that extension contributes. Entries whose key is not in `activeSet`
 *   are ignored.
 */
export function acceptedResultTypes(
  activeSet: Iterable<string>,
  activeContributions: ReadonlyMap<string, Iterable<string>> = new Map(),
): Set<string> {
  const active = activeSet instanceof Set ? activeSet : new Set(activeSet);
  const accepted = new Set<string>(CORE_RESULT_TYPE_VALUES);
  for (const [identifier, values] of activeContributions) {
    if (!active.has(identifier)) continue; // non-active contributions excluded (R-24.5-f)
    for (const value of values) accepted.add(value);
  }
  return accepted;
}

/**
 * Returns `true` when `resultType` is accepted: it is a core value, or it is
 * contributed by an extension that is in the active set. (R-24.5-e, R-24.5-f)
 *
 * A value that is neither core nor contributed by an active extension is
 * INVALID — this returns `false`, and the receiver MUST treat the response as an
 * error (per §3.6 / S04 `interpretResultType`).
 */
export function isResultTypeAccepted(
  resultType: string,
  activeSet: Iterable<string>,
  activeContributions: ReadonlyMap<string, Iterable<string>> = new Map(),
): boolean {
  if (isKnownResultType(resultType)) return true;
  return acceptedResultTypes(activeSet, activeContributions).has(resultType);
}

// ─── §24.3 / §24.4 — Active set ────────────────────────────────────────────────

/**
 * Computes the active set for an interaction: the intersection of the client's
 * and the server's advertised `extensions` maps. (R-24.3-d)
 *
 * This is a thin, intention-revealing wrapper over S11's
 * {@link intersectExtensions}: each side's raw map is normalized (so `null` /
 * malformed entries (R-24.3-c) and unrecognized one-sided identifiers (R-24.7-g)
 * fall outside the intersection), and the result is a deterministic, sorted
 * array. An empty or absent map on either side yields an empty active set
 * (R-24.3-a).
 *
 * @param clientExtensions - The client's advertised `extensions` map (raw).
 * @param serverExtensions - The server's advertised `extensions` map (raw).
 */
export function computeActiveSet(clientExtensions: unknown, serverExtensions: unknown): string[] {
  return intersectExtensions(clientExtensions, serverExtensions);
}

/**
 * Computes the active set for ONE request under the stateless model: it reads
 * the client's capabilities from the request being processed and intersects them
 * with the server's advertised capabilities. (R-24.4-a, R-24.4-b, R-24.4-c)
 *
 * The result depends solely on `requestClientExtensions` (this request's
 * advertised client capabilities) and `serverExtensions`; nothing from a prior
 * request is consulted. A request that does not advertise an extension therefore
 * yields an active set without it — it is served as if that extension were
 * inactive. (R-24.4-c)
 *
 * @param requestClientExtensions - The `extensions` map carried in THIS request's
 *   `io.modelcontextprotocol/clientCapabilities` (raw; `undefined` ⇒ none).
 * @param serverExtensions        - The server's advertised `extensions` map (raw).
 */
export function activeSetForRequest(
  requestClientExtensions: unknown,
  serverExtensions: unknown,
): string[] {
  return intersectExtensions(requestClientExtensions, serverExtensions);
}

/**
 * Returns `true` when an extension MAY emit its surface in the current
 * interaction: it is present in `activeSet`. (R-24.1-c, R-24.3-e, R-24.5-c)
 *
 * Extensions are disabled by default — a peer MUST NOT emit a method,
 * notification, reserved `_meta` key, `resultType` value, or field defined by an
 * extension that this predicate reports as not active.
 */
export function mayEmitExtensionSurface(identifier: string, activeSet: Iterable<string>): boolean {
  const active = activeSet instanceof Set ? activeSet : new Set(activeSet);
  return active.has(identifier);
}

// ─── §24.6 — Versioning, stability, deprecation ────────────────────────────────

/**
 * Reads an extension's version from the settings object it advertised, making
 * the version discoverable purely through negotiation. (R-24.6-a, R-24.6-b)
 *
 * The version is taken from the settings' `version` field when it is a string or
 * a number (numbers are normalized to their string form). It is NEVER inferred
 * from out-of-band information — when the extension is not advertised, or carries
 * no `version`, this returns `undefined`. (R-24.6-b)
 *
 * @param extensionsMap - A peer's advertised `extensions` map (raw).
 * @param identifier    - The extension whose version to read.
 * @param versionKey    - The settings key carrying the version (default
 *   `'version'`); an extension MAY use a different key per its own rules.
 */
export function getExtensionVersion(
  extensionsMap: unknown,
  identifier: string,
  versionKey = 'version',
): string | undefined {
  const settings = getExtensionSettings(extensionsMap, identifier);
  if (settings === undefined) return undefined;
  const raw = settings[versionKey];
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw);
  return undefined;
}

/**
 * The kinds of change that are INCOMPATIBLE and therefore SHOULD be published
 * under a new identifier rather than evolved within one. (R-24.6-d)
 *
 *   - `remove-field` / `rename-field` — removing or renaming a field;
 *   - `change-type`                   — changing a field's type;
 *   - `change-semantics`              — altering existing behavior's meaning;
 *   - `add-required-field`            — adding a new REQUIRED field.
 */
export type ExtensionChangeKind =
  | 'add-optional-field'
  | 'add-capability-flag'
  | 'remove-field'
  | 'rename-field'
  | 'change-type'
  | 'change-semantics'
  | 'add-required-field';

/**
 * Returns `true` when a change of `kind` is INCOMPATIBLE — it would cause an
 * existing implementation to fail or behave incorrectly — and therefore SHOULD
 * be published under a new extension identifier. (R-24.6-d)
 *
 * Backward-compatible changes (`add-optional-field`, `add-capability-flag`)
 * return `false`; they SHOULD instead be expressed via capability flags / a
 * version marker inside the existing identifier's settings object. (R-24.6-c)
 */
export function isIncompatibleChange(kind: ExtensionChangeKind): boolean {
  switch (kind) {
    case 'add-optional-field':
    case 'add-capability-flag':
      return false;
    case 'remove-field':
    case 'rename-field':
    case 'change-type':
    case 'change-semantics':
    case 'add-required-field':
      return true;
  }
}

/**
 * Suggests a successor extension identifier for an incompatible change, keeping
 * the two distinct in the negotiation map (e.g.
 * `com.example/my-extension → com.example/my-extension-2`). (R-24.6-d)
 *
 * The suffix is appended to the identifier's NAME segment so the result is
 * itself a well-formed identifier under the same vendor prefix.
 *
 * @throws {RangeError} when `identifier` is malformed.
 */
export function suggestSuccessorIdentifier(identifier: string, suffix = '2'): string {
  const parsed = parseExtensionId(identifier);
  if (parsed === undefined || !isValidExtensionId(identifier)) {
    throw new RangeError(`Cannot derive a successor for malformed identifier "${identifier}" (R-24.6-d)`);
  }
  return `${parsed.prefix}/${parsed.name}-${suffix}`;
}

// ─── §24.7 — Graceful degradation & required-extension errors ──────────────────

/**
 * The JSON-RPC error code an implementation that MANDATES an extension uses when
 * the other side does not advertise it and it refuses the interaction. (R-24.7-f)
 *
 * The framework defines no error code of its own (the story is conceptual); a
 * mandated-but-absent extension is a "missing required capability" condition, so
 * this reuses the core `-32003` code (S05/S09 `MISSING_CLIENT_CAPABILITY_CODE`)
 * rather than minting a new one.
 */
export const REQUIRED_EXTENSION_ABSENT_CODE = MISSING_CLIENT_CAPABILITY_CODE;

/** The REQUIRED `data` payload of a {@link RequiredExtensionError}. */
export interface RequiredExtensionErrorData {
  /** The extension whose absence blocked the interaction — names it so an
   * operator/developer can act. (R-24.7-e) */
  requiredExtension: string;
}

/** An actionable error for a mandated extension the other peer did not advertise. */
export interface RequiredExtensionError {
  code: typeof REQUIRED_EXTENSION_ABSENT_CODE;
  message: string;
  data: RequiredExtensionErrorData;
}

/**
 * Builds an actionable error for the case where an implementation genuinely
 * requires an extension the other side does not advertise. (R-24.7-d, R-24.7-e)
 *
 * The error identifies the required extension (in both the message and
 * `data.requiredExtension`) so the failure is not opaque and an operator or
 * developer can act on it.
 *
 * @param identifier - The required-but-absent extension identifier.
 */
export function buildRequiredExtensionError(identifier: string): RequiredExtensionError {
  return {
    code: REQUIRED_EXTENSION_ABSENT_CODE,
    message: `Required extension not active: "${identifier}"`,
    data: { requiredExtension: identifier },
  };
}

/**
 * Decides how a peer should handle an operation that could use `identifier`,
 * given the active set and whether the operation mandates the extension.
 * (R-24.7-a, R-24.7-b, R-24.7-d, R-24.7-f)
 *
 *   - active                    → `'use-extension'`;
 *   - not active, not mandatory → `'fallback'` (use core behavior, R-24.7-a/b);
 *   - not active, mandatory     → `'reject'`   (surface an actionable error).
 *
 * Thin wrapper over S11's {@link decideExtensionFallback} that derives `active`
 * from membership in `activeSet`, so callers reason in terms of the active set
 * rather than two raw maps.
 */
export function decideExtensionUse(opts: {
  identifier: string;
  activeSet: Iterable<string>;
  mandatory: boolean;
}): ExtensionFallbackDecision {
  return decideExtensionFallback({
    active: mayEmitExtensionSurface(opts.identifier, opts.activeSet),
    mandatory: opts.mandatory,
  });
}

// ─── Extension definition & no-redefinition guard ──────────────────────────────

/**
 * A declarative description of the surface a single extension contributes — the
 * machine-checkable form of "an active extension MAY extend the surface ONLY in
 * the four enumerated ways" (§24.5). A conformance suite can validate an
 * extension's claimed surface against the framework using {@link validateExtensionDefinition}.
 */
export interface ExtensionDefinition {
  /** The extension's globally unique identifier (§24.2). */
  identifier: string;
  /** How the extension is characterized (§24.1). */
  classification?: ExtensionClassification;
  /** Channel 1 — request methods and notifications the extension defines (R-24.5-b). */
  methods?: readonly string[];
  /** Channel 2 — reserved `_meta` keys the extension defines (R-24.5-d). */
  metaKeys?: readonly string[];
  /** Channel 3 — additional `resultType` discriminator values (R-24.5-e). */
  resultTypes?: readonly string[];
  /** Channel 4 — additional fields the extension adds to existing objects (R-24.5-g).
   * Listed as `"<ObjectName>.<fieldName>"` for documentation/conformance. */
  fields?: readonly string[];
}

/** A single reason an {@link ExtensionDefinition} fails framework conformance. */
export interface ExtensionDefinitionViolation {
  /** Which surface channel (or the identifier) the violation concerns. */
  channel: ExtensionSurfaceChannel | 'identifier';
  /** The offending value (a method, key, resultType, field, or the identifier). */
  value: string;
  /** Human-readable description of why it violates the framework. */
  message: string;
}

/** Outcome of {@link validateExtensionDefinition}. */
export type ExtensionDefinitionValidation =
  | { ok: true }
  | { ok: false; violations: ExtensionDefinitionViolation[] };

/**
 * Validates that an {@link ExtensionDefinition} conforms to the §24 framework:
 * a valid identifier, namespaced methods, controlled `_meta` keys, and no
 * redefinition of core surface. (R-24-a, R-24.5-b, R-24.5-d, R-24.5-e, R-24.5-i)
 *
 * Checks, accumulating ALL violations:
 *   - the identifier is well-formed (R-24.2-a..d via {@link isValidExtensionId});
 *   - every method is in the identifier-derived namespace (R-24.5-b);
 *   - every `_meta` key is under a prefix the extension controls (R-24.5-d);
 *   - no `resultType` collides with a core value — that would redefine core
 *     surface (R-24.5-i; a new value MUST be additional, R-24.5-e);
 *   - the extension classification, when present, is recognized (R-24.1-a).
 *
 * This is the mechanism by which "a non-conforming extension is rejected by the
 * conformance suite" (AC-38.1) and "surface added outside the mechanism is
 * flagged non-conformant" (AC-38.5) are realized for a declared surface.
 */
export function validateExtensionDefinition(def: ExtensionDefinition): ExtensionDefinitionValidation {
  const violations: ExtensionDefinitionViolation[] = [];

  if (!isValidExtensionId(def.identifier)) {
    violations.push({
      channel: 'identifier',
      value: def.identifier,
      message: 'Extension identifier is not well-formed (R-24.2-a..d)',
    });
    // Without a valid identifier we cannot derive namespaces; report and stop.
    return { ok: false, violations };
  }

  if (def.classification !== undefined && !isExtensionClassification(def.classification)) {
    violations.push({
      channel: 'identifier',
      value: String(def.classification),
      message: 'Unknown extension classification (R-24.1-a)',
    });
  }

  for (const method of def.methods ?? []) {
    if (!isMethodInExtensionNamespace(method, def.identifier)) {
      violations.push({
        channel: 'method',
        value: method,
        message: `Method "${method}" is not namespaced under the extension (R-24.5-b)`,
      });
    }
  }

  for (const key of def.metaKeys ?? []) {
    if (!isExtensionControlledMetaKey(key, def.identifier)) {
      violations.push({
        channel: 'meta-key',
        value: key,
        message: `_meta key "${key}" is not under a prefix the extension controls (R-24.5-d)`,
      });
    }
  }

  for (const rt of def.resultTypes ?? []) {
    if (isKnownResultType(rt)) {
      violations.push({
        channel: 'result-type',
        value: rt,
        message: `resultType "${rt}" redefines a core value; extensions may only add new values (R-24.5-e, R-24.5-i)`,
      });
    }
  }

  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}

// ─── §24.5(1) — Active-set-gated method dispatch ───────────────────────────────

/** A handler for one extension-defined method. */
export type ExtensionMethodHandler<Params = unknown, Result = unknown> = (
  params: Params,
) => Result;

/** A registered method: its owning extension and its handler. */
interface RegisteredExtensionMethod {
  identifier: string;
  handler: ExtensionMethodHandler;
}

/** Why {@link ExtensionMethodRouter.dispatch} declined to invoke a handler. */
export type ExtensionDispatchRejection =
  /** No extension registered this method string. */
  | 'unknown-method'
  /** The owning extension is not in the active set for this interaction. (R-24.5-c) */
  | 'extension-inactive';

/** Outcome of {@link ExtensionMethodRouter.dispatch}. */
export type ExtensionDispatchOutcome<Result = unknown> =
  | { ok: true; result: Result }
  | { ok: false; reason: ExtensionDispatchRejection; code: typeof INVALID_PARAMS_CODE };

/**
 * Routes extension-defined methods to their handlers, enforcing the two
 * framework rules that govern dispatch:
 *   - method strings are namespaced under the registering extension (R-24.5-b);
 *   - a handler is invoked ONLY when its extension is in the active set for the
 *     interaction (R-24.5-c) — a non-active extension's method is never run.
 *
 * Registration validates the namespace eagerly so a misnamed method is rejected
 * at wiring time, not silently at dispatch. The router holds no per-connection
 * state; the active set is supplied per dispatch, honoring the stateless model
 * (§24.4).
 */
export class ExtensionMethodRouter {
  readonly #methods = new Map<string, RegisteredExtensionMethod>();

  /**
   * Registers `handler` for an extension-defined `method`. The method MUST be in
   * `identifier`'s derived namespace (R-24.5-b) and MUST NOT already be
   * registered (no redefinition, R-24.5-i).
   *
   * @throws {RangeError} when the method is not namespaced under `identifier` or
   *   the method string is already registered.
   */
  register(identifier: string, method: string, handler: ExtensionMethodHandler): this {
    if (!isMethodInExtensionNamespace(method, identifier)) {
      throw new RangeError(
        `Method "${method}" is not namespaced under "${identifier}" (R-24.5-b)`,
      );
    }
    if (this.#methods.has(method)) {
      throw new RangeError(`Method "${method}" is already registered (R-24.5-i)`);
    }
    this.#methods.set(method, { identifier, handler });
    return this;
  }

  /** Returns `true` when `method` has a registered handler. */
  has(method: string): boolean {
    return this.#methods.has(method);
  }

  /** Returns the extension identifier that owns `method`, or `undefined`. */
  ownerOf(method: string): string | undefined {
    return this.#methods.get(method)?.identifier;
  }

  /**
   * Dispatches `method` with `params`, but only when the owning extension is in
   * `activeSet`. (R-24.5-c)
   *
   *   - unknown method            → `{ ok: false, reason: 'unknown-method' }`;
   *   - owning extension inactive → `{ ok: false, reason: 'extension-inactive' }`
   *     (the method is NOT invoked — a non-active extension's surface is ignored);
   *   - otherwise                 → `{ ok: true, result }` from the handler.
   *
   * Both rejections carry `INVALID_PARAMS_CODE` so a caller can convert the
   * outcome into a core error response when it chooses to reject rather than
   * ignore (R-24.3-f).
   */
  dispatch(method: string, params: unknown, activeSet: Iterable<string>): ExtensionDispatchOutcome {
    const registered = this.#methods.get(method);
    if (registered === undefined) {
      return { ok: false, reason: 'unknown-method', code: INVALID_PARAMS_CODE };
    }
    if (!mayEmitExtensionSurface(registered.identifier, activeSet)) {
      return { ok: false, reason: 'extension-inactive', code: INVALID_PARAMS_CODE };
    }
    return { ok: true, result: registered.handler(params) };
  }
}

// ─── Settings reconciliation (§24.3-g) ─────────────────────────────────────────

/**
 * Reconciles the settings a peer advertised for `identifier` on each side,
 * producing the inputs an extension needs to apply its own reconciliation rules.
 * (R-24.3-g) Returns `undefined` when the extension is not advertised by BOTH
 * peers (it is not active, so there is nothing to reconcile).
 *
 * Each side's settings are returned as-is (S11 already dropped `null`/malformed
 * entries); the extension itself decides how to combine them (e.g. intersect MIME
 * types, pick the lower version). This helper only guarantees both sides'
 * settings are present and the extension is active.
 *
 * @param clientExtensions - The client's advertised `extensions` map (raw).
 * @param serverExtensions - The server's advertised `extensions` map (raw).
 * @param identifier       - The extension whose settings to reconcile.
 */
export function reconcileExtensionSettings(
  clientExtensions: unknown,
  serverExtensions: unknown,
  identifier: string,
): { client: ExtensionSettings; server: ExtensionSettings } | undefined {
  if (!isExtensionAdvertised(clientExtensions, identifier)) return undefined;
  if (!isExtensionAdvertised(serverExtensions, identifier)) return undefined;
  const client = getExtensionSettings(clientExtensions, identifier);
  const server = getExtensionSettings(serverExtensions, identifier);
  if (client === undefined || server === undefined) return undefined;
  return { client, server };
}
