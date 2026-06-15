/**
 * S11 — The Extensions Map & Forward Compatibility (§6.5–§6.7).
 *
 * The structured `extensions` map that lives inside both `ClientCapabilities`
 * and `ServerCapabilities` (the generic `extensions` field already exists on
 * those schemas from S10), plus the forward-compatibility rules that govern how
 * peers treat capability fields, extension keys, and settings they do not
 * recognize. It defines:
 *   - the extension-identifier grammar (`prefix/name`) and a parser/validator;
 *   - the reserved-prefix rule (second label is `modelcontextprotocol`/`mcp`);
 *   - the settings-value semantics (`{}` = enabled-no-settings; `null` =
 *     malformed-and-ignored; unknown settings keys are ignored);
 *   - normalization of a raw `extensions` map (drop `null` / malformed entries);
 *   - activation-by-intersection and the one-sided-support fallback decision;
 *   - forward-compatibility helpers (ignore unknown extension keys / settings
 *     keys; never treat unknown things as errors).
 *
 * This module deliberately defines its own identifier grammar rather than
 * reusing `src/json/meta-key.ts`: the `_meta` prefix is OPTIONAL whereas an
 * extension identifier's prefix is REQUIRED (R-6.5-a). The name grammar and the
 * reserved-second-label rule are identical to the `_meta` rules and are
 * re-implemented here so the two surfaces evolve independently.
 *
 * Out of scope (owned elsewhere, per the story):
 *   - the core (non-extension) capability fields and per-request gating — S10;
 *   - the full extension mechanism (methods/notifications/versioning) — S38;
 *   - the concrete `io.modelcontextprotocol/tasks` and `/ui` extensions — S39–S42;
 *   - the `_meta` structure and `server/discover` envelope used by the wire
 *     examples — S05 / S08.
 */

import { z } from 'zod';

// ─── Identifier grammar (§6.5, R-6.5-a – R-6.5-f) ──────────────────────────────

/** Labels that make a prefix reserved when they appear as the SECOND label. (R-6.5-g) */
const RESERVED_SECOND_LABELS = new Set(['modelcontextprotocol', 'mcp']);

/**
 * Tests whether a single prefix label is well-formed. (R-6.5-b, R-6.5-c)
 *
 * A label MUST start with a letter and end with a letter or digit; interior
 * characters MAY be letters, digits, or hyphens. A single-letter label (start
 * and end coincide on a letter) is valid.
 */
function isValidPrefixLabel(label: string): boolean {
  return /^[a-zA-Z]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(label);
}

/**
 * Returns `true` when `prefix` is a syntactically valid extension-identifier
 * prefix: one or more dot-separated labels (no trailing slash). (R-6.5-a – R-6.5-c)
 *
 * Reverse-DNS notation (e.g. `com.example`) is RECOMMENDED but not enforced; any
 * dot-separated sequence of valid labels is accepted. (R-6.5-d)
 */
export function isValidExtensionPrefix(prefix: string): boolean {
  if (prefix.length === 0) return false;
  return prefix.split('.').every(isValidPrefixLabel);
}

/**
 * Returns `true` when `name` is a valid extension name (the part after the
 * slash). An empty name is permitted. (R-6.5-e, R-6.5-f)
 *
 * A non-empty name MUST begin and end with an alphanumeric character; interior
 * characters MAY be hyphens, underscores, dots, or alphanumerics.
 */
export function isValidExtensionName(name: string): boolean {
  if (name === '') return true;
  return /^[a-zA-Z0-9]([a-zA-Z0-9._-]*[a-zA-Z0-9])?$/.test(name);
}

/** The parsed parts of an extension identifier. */
export interface ParsedExtensionId {
  /** The prefix (everything before the FIRST slash), without the slash. */
  prefix: string;
  /** The name (everything after the first slash); MAY be empty. */
  name: string;
}

/**
 * Splits an extension identifier at its FIRST slash into `prefix` and `name`.
 * Returns `undefined` when the string contains no slash at all — an identifier
 * without a separating slash has no prefix and is therefore malformed. (R-6.5-a)
 *
 * Because the split is on the first slash, any later slashes (which would make
 * the name invalid) are retained in `name` so {@link isValidExtensionName}
 * rejects them.
 */
export function parseExtensionId(identifier: string): ParsedExtensionId | undefined {
  const slash = identifier.indexOf('/');
  if (slash === -1) return undefined;
  return { prefix: identifier.slice(0, slash), name: identifier.slice(slash + 1) };
}

/**
 * Returns `true` when `identifier` is a well-formed extension identifier:
 * a REQUIRED prefix, a single separating slash, and a (possibly empty) name,
 * each conforming to the §6.5 grammar. (R-6.5-a, R-6.5-b, R-6.5-e, R-6.5-f)
 *
 * Note: well-formedness is independent of whether the prefix is reserved — a
 * reserved identifier such as `io.modelcontextprotocol/tasks` is well-formed;
 * use {@link isReservedExtensionPrefix} / {@link isThirdPartyUsable} for the
 * reserved-prefix policy.
 */
export function isValidExtensionId(identifier: string): boolean {
  const parsed = parseExtensionId(identifier);
  if (parsed === undefined) return false;
  return isValidExtensionPrefix(parsed.prefix) && isValidExtensionName(parsed.name);
}

// ─── Reserved prefixes (§6.5, R-6.5-g) ─────────────────────────────────────────

/**
 * Returns `true` when `prefix` is reserved for official MCP use — i.e. its
 * SECOND label is `modelcontextprotocol` or `mcp`. (R-6.5-g)
 *
 * A prefix is NOT reserved merely because those tokens appear as some other
 * label: `com.example.mcp` is not reserved (its second label is `example`),
 * whereas `io.modelcontextprotocol`, `dev.mcp`, `org.modelcontextprotocol.api`,
 * and `com.mcp` are all reserved.
 */
export function isReservedExtensionPrefix(prefix: string): boolean {
  const labels = prefix.split('.');
  return labels.length >= 2 && RESERVED_SECOND_LABELS.has(labels[1] ?? '');
}

/**
 * Returns `true` when a THIRD PARTY may define an extension under `identifier` —
 * the identifier must be well-formed and its prefix must not be reserved.
 * (R-6.5-g)
 *
 * A malformed identifier is not third-party usable either; the prohibition in
 * R-6.5-g is specifically about reserved prefixes, but an unusable-for-anyone
 * malformed identifier is likewise not available to third parties.
 */
export function isThirdPartyUsable(identifier: string): boolean {
  const parsed = parseExtensionId(identifier);
  if (parsed === undefined) return false;
  if (!isValidExtensionPrefix(parsed.prefix) || !isValidExtensionName(parsed.name)) return false;
  return !isReservedExtensionPrefix(parsed.prefix);
}

// ─── Settings values & the extensions map shape (§6.5) ─────────────────────────

/**
 * Returns `true` when `value` is a non-null, non-array object — the only legal
 * shape for an extension settings value. An empty object `{}` qualifies (it is a
 * valid enabling declaration, not absence). (R-6.5-h)
 */
export function isExtensionSettings(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Schema for a single extension settings object: any object, including the empty
 * object `{}`. (R-6.5-h) A `null` value is intentionally NOT accepted here
 * (R-6.5-i); receivers normalize a raw map with {@link normalizeExtensionsMap},
 * which drops `null`/malformed entries rather than rejecting the whole map.
 */
export const ExtensionSettingsSchema = z.record(z.unknown());

export type ExtensionSettings = z.infer<typeof ExtensionSettingsSchema>;

/**
 * Schema for a producer-built, well-formed `extensions` map: extension
 * identifier → settings object, with NO `null` values. (§6.5)
 *
 * This is the schema a PRODUCER validates its own map against (R-6.5-i: no key
 * maps to `null`). A RECEIVER processing an untrusted map should instead call
 * {@link normalizeExtensionsMap}, which tolerates and discards malformed
 * entries per the forward-compatibility rules (R-6.5-j, R-6.6-d).
 */
export const ExtensionsMapSchema = z.record(ExtensionSettingsSchema);

export type ExtensionsMap = z.infer<typeof ExtensionsMapSchema>;

/**
 * Returns `true` when `map` is a valid producer-built `extensions` map: every
 * value is a settings object and no value is `null`. (R-6.5-i)
 */
export function isValidExtensionsMap(map: unknown): map is ExtensionsMap {
  return ExtensionsMapSchema.safeParse(map).success;
}

// ─── Normalization / forward compatibility (§6.5, §6.6) ────────────────────────

/**
 * Normalizes a raw, possibly-untrusted `extensions` map into the set of
 * extensions a receiver should consider ADVERTISED by the peer.
 *
 * Applies the receiver rules together:
 *   - a `null` value is malformed → the entry is ignored (the extension is
 *     treated as not advertised by that peer). (R-6.5-j)
 *   - a non-object value (array, scalar) is likewise malformed → ignored.
 *   - a well-formed `{}` is retained — it is an enabling declaration, not
 *     absence. (R-6.5-h)
 *   - keys whose identifiers are unknown to the receiver are RETAINED by this
 *     function (forward compatibility is about not erroring); whether such a key
 *     becomes active is decided by {@link intersectExtensions} against the
 *     receiver's own advertised set. (R-6.6-d)
 *
 * Returns a NEW object; the input is not mutated. The result is a clean
 * `ExtensionsMap` (no `null`/malformed values).
 *
 * @param raw - The peer's advertised `extensions` map (or `undefined` when the
 *   peer advertised none — equivalent to an empty map).
 */
export function normalizeExtensionsMap(raw: unknown): ExtensionsMap {
  const out: ExtensionsMap = {};
  if (!isExtensionSettings(raw)) return out;
  for (const [key, value] of Object.entries(raw)) {
    // null / array / scalar values are malformed and ignored. (R-6.5-i, R-6.5-j)
    if (!isExtensionSettings(value)) continue;
    out[key] = value;
  }
  return out;
}

/**
 * Returns `true` when a receiver should treat `identifier` as ADVERTISED by a
 * peer whose raw `extensions` map is `raw` — the key is present and maps to a
 * valid (non-`null`, object) settings value. (R-6.5-h, R-6.5-j)
 *
 * A `null`-valued or otherwise-malformed entry is treated as not advertised.
 */
export function isExtensionAdvertised(raw: unknown, identifier: string): boolean {
  if (!isExtensionSettings(raw)) return false;
  return isExtensionSettings(raw[identifier]);
}

/**
 * Returns the settings object a peer advertised for `identifier`, or `undefined`
 * when the extension is not validly advertised (absent, `null`, or malformed).
 * (R-6.5-h, R-6.5-j)
 *
 * The returned object MAY contain settings keys the receiving extension does not
 * define; those MUST be ignored by the extension, not rejected. (R-6.5-k,
 * R-6.6-e) Use {@link pickKnownSettings} to project to the keys an extension
 * understands.
 */
export function getExtensionSettings(raw: unknown, identifier: string): ExtensionSettings | undefined {
  if (!isExtensionSettings(raw)) return undefined;
  const value = raw[identifier];
  return isExtensionSettings(value) ? value : undefined;
}

/**
 * Projects a settings object down to only the keys an extension defines,
 * ignoring (dropping) any keys the extension does not recognize. (R-6.5-k,
 * R-6.6-e)
 *
 * This realizes "a receiver MUST ignore settings keys it does not recognize":
 * unknown keys are silently dropped, never treated as an error, so an extension
 * can add settings over time without breaking older receivers.
 *
 * @param settings - The raw settings object (may carry unknown keys).
 * @param knownKeys - The settings keys this extension version defines.
 */
export function pickKnownSettings(
  settings: Record<string, unknown>,
  knownKeys: Iterable<string>,
): Record<string, unknown> {
  const known = knownKeys instanceof Set ? knownKeys : new Set(knownKeys);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(settings)) {
    if (known.has(key)) out[key] = value;
  }
  return out;
}

// ─── Activation by intersection (§6.5, R-6.5-l/m) ──────────────────────────────

/**
 * Returns the set of extension identifiers ACTIVE for an interaction: those
 * advertised (validly) by BOTH peers — the intersection of the two maps.
 * (R-6.5-l)
 *
 * Each raw map is normalized first, so `null`/malformed entries on either side
 * (R-6.5-j) and unknown keys that the other side does not advertise (R-6.6-d)
 * naturally fall outside the intersection. The result is a sorted array for
 * deterministic output.
 *
 * @param clientExtensions - The client's advertised `extensions` map (raw).
 * @param serverExtensions - The server's advertised `extensions` map (raw).
 */
export function intersectExtensions(clientExtensions: unknown, serverExtensions: unknown): string[] {
  const client = normalizeExtensionsMap(clientExtensions);
  const server = normalizeExtensionsMap(serverExtensions);
  const active: string[] = [];
  for (const id of Object.keys(client)) {
    if (Object.prototype.hasOwnProperty.call(server, id)) active.push(id);
  }
  return active.sort();
}

/**
 * Returns `true` when extension `identifier` is ACTIVE between two peers — i.e.
 * both peers validly advertise it. A peer MUST NOT exercise an extension's
 * behavior unless this returns `true`. (R-6.5-l)
 */
export function isExtensionActive(
  identifier: string,
  clientExtensions: unknown,
  serverExtensions: unknown,
): boolean {
  return isExtensionAdvertised(clientExtensions, identifier) &&
    isExtensionAdvertised(serverExtensions, identifier);
}

// ─── One-sided-support fallback (§6.5, R-6.5-n) ────────────────────────────────

/**
 * What a peer should do for an operation that COULD use an extension which is
 * not active in the intersection.
 *
 *   - `'use-extension'` — the extension is active; exercise its behavior.
 *   - `'fallback'`      — not active, but the operation has a core fallback.
 *   - `'reject'`        — not active and the extension is MANDATORY for this
 *                         operation; reject with an appropriate error.
 */
export type ExtensionFallbackDecision = 'use-extension' | 'fallback' | 'reject';

/**
 * Decides how to handle an operation given whether the extension is active
 * (advertised by both peers) and whether it is mandatory for the operation.
 * (R-6.5-l, R-6.5-n)
 *
 *   - active                       → `'use-extension'`
 *   - not active, not mandatory    → `'fallback'` (use core protocol behavior)
 *   - not active, mandatory        → `'reject'`
 *
 * A peer MUST NOT `'reject'` merely because the extension is one-sided; rejection
 * happens only when the extension is mandatory for the operation. (R-6.5-n)
 */
export function decideExtensionFallback(opts: {
  active: boolean;
  mandatory: boolean;
}): ExtensionFallbackDecision {
  if (opts.active) return 'use-extension';
  return opts.mandatory ? 'reject' : 'fallback';
}

// ─── Forward compatibility for capability objects (§6.6) ───────────────────────

/**
 * The core (recognized) capability field names a receiver of this SDK revision
 * understands. Any field NOT in these sets is "unknown" and MUST be tolerated
 * and ignored — never rejected, never treated as an error. (R-6.6-a – R-6.6-c,
 * R-6.6-f)
 *
 * These mirror the fields on `ClientCapabilitiesSchema` / `ServerCapabilitiesSchema`
 * (S10); they exist here so {@link unknownCapabilityFields} can report which
 * fields a receiver would ignore without coupling to those schemas' internals.
 */
export const KNOWN_CLIENT_CAPABILITY_FIELDS: ReadonlySet<string> = new Set([
  'experimental',
  'elicitation',
  'roots',
  'sampling',
  'extensions',
]);

/** The core (recognized) server capability field names. (See {@link KNOWN_CLIENT_CAPABILITY_FIELDS}.) */
export const KNOWN_SERVER_CAPABILITY_FIELDS: ReadonlySet<string> = new Set([
  'experimental',
  'completions',
  'prompts',
  'resources',
  'tools',
  'logging',
  'extensions',
]);

/**
 * Returns the capability fields in `caps` that `known` does not recognize.
 * A receiver MUST ignore exactly these fields and MUST NOT reject the capability
 * object (or the message carrying it) because they are present. (R-6.6-b,
 * R-6.6-c, R-6.6-f)
 *
 * @param caps  - A raw `ClientCapabilities` / `ServerCapabilities` object.
 * @param known - The recognized field names (e.g.
 *   {@link KNOWN_CLIENT_CAPABILITY_FIELDS}).
 */
export function unknownCapabilityFields(
  caps: Record<string, unknown>,
  known: ReadonlySet<string>,
): string[] {
  return Object.keys(caps).filter((field) => !known.has(field));
}

/**
 * Produces the view of a capability object a receiver acts on: the recognized
 * fields only, with unrecognized fields dropped (ignored). The presence of an
 * unknown field never causes rejection — this function simply omits it.
 * (R-6.6-b, R-6.6-c, R-6.6-f, R-6.6-g)
 *
 * Dropping an unknown field MUST NOT be read as the peer not supporting anything
 * the receiver DOES understand; the recognized fields are passed through
 * unchanged so no such inference can be drawn. (R-6.6-g)
 *
 * @param caps  - A raw capability object (possibly carrying unknown fields).
 * @param known - The recognized field names for this object kind.
 */
export function ignoreUnknownCapabilityFields(
  caps: Record<string, unknown>,
  known: ReadonlySet<string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(caps)) {
    if (known.has(field)) out[field] = value;
  }
  return out;
}
