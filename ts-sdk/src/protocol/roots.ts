/**
 * S32 — Roots (Deprecated) (§21.1).
 *
 * ⚠️ DEPRECATED CAPABILITY. The `roots` client capability is Deprecated as a
 * present condition: implementations SHOULD NOT adopt it for new functionality,
 * and it remains defined here ONLY for interoperability with existing
 * deployments. (R-21-a, R-21.1-a, R-21.1.1-a · SHOULD NOT) New functionality
 * SHOULD instead convey relevant directories/files through tool input
 * parameters (S24/S25), resource URIs (S26/S27), or server configuration.
 * (R-21.1.1-b · SHOULD) The "Deprecated" label does NOT relax the wire
 * contract: a conforming receiver MUST keep honoring it for as long as the
 * capability is published. (R-21.1.1-c · MUST)
 *
 * The Roots capability lets a client expose filesystem "roots" — directories
 * and files it considers relevant — so a server can focus its operations on
 * them. Roots are INFORMATIONAL GUIDANCE, not an access-control boundary: the
 * protocol does NOT enforce that a server confines itself to the listed roots.
 * (R-21.1.5-l · MUST NOT)
 *
 * Delivery (multi-round-trip, S17): roots is never a server-initiated JSON-RPC
 * request. A server requests roots by returning an input-required result whose
 * embedded input request has `method: "roots/list"` plus a request-state token;
 * the client retries the originating request, supplying the `ListRootsResult`
 * as the input response keyed to `"roots/list"`. (R-21.1.3-a · MUST) The
 * envelope, request-state token, and keying are owned by S17; this module fills
 * in only the `roots/list` payloads.
 *
 * This module BUILDS ON the forward declarations in
 * `src/protocol/multi-round-trip.ts` (`RootsListInputRequestSchema`,
 * `ListRootsResultSchema`) and the capability gating in
 * `src/protocol/capability-negotiation.ts` (`mayInvokeRootsList`,
 * `clientDeclares`, `isDeprecatedClientCapability`) rather than redefining
 * them. It adds the §21.1-owned pieces: the `roots` capability-value shape, the
 * strongly-typed `Root` entry (with `file://` + RFC 3986 validation), the
 * non-`file`-scheme reject/ignore choice, the path-traversal guard, and the
 * consent/non-enforcement obligations.
 */

import { z } from 'zod';

import {
  RootsListInputRequestSchema,
} from './multi-round-trip.js';
import {
  mayInvokeRootsList,
  clientDeclares,
  isDeprecatedClientCapability,
} from './capability-negotiation.js';

// NOTE: the reused S17 forward declarations (`RootsListInputRequestSchema`,
// `ListRootsResultSchema`) and the S10 gating helpers (`mayInvokeRootsList`,
// `clientDeclares`, `isDeprecatedClientCapability`) are imported above for
// internal use but are deliberately NOT re-exported here: they already reach
// the public surface through `export * from './multi-round-trip.js'` and
// `export * from './capability-negotiation.js'` in the protocol barrel, and a
// second star-export of the same bindings would create an ambiguous export.
// (Same convention as the sibling deprecated modules.) Import them from their
// canonical modules.

/** Returns `true` when `value` is a non-null, non-array object (a JSON object). */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// ─── Deprecation marker ────────────────────────────────────────────────────────

/**
 * The `roots` capability name. Marked Deprecated (R-21-a, R-21.1-a,
 * R-21.1.1-a · SHOULD NOT); present only for interoperability. Confirmable via
 * {@link isRootsDeprecated} / `isDeprecatedClientCapability('roots')`.
 */
export const ROOTS_CAPABILITY_NAME = 'roots' as const;

/**
 * The migration targets a builder SHOULD choose INSTEAD of roots for new
 * functionality. (R-21.1.1-b · SHOULD)
 *
 * Conveying relevant directories/files via any of these — NOT via the roots
 * capability — is the conformant choice for new functionality. (AC-32.1)
 */
export const ROOTS_MIGRATION_TARGETS = [
  'tool-input-parameters',
  'resource-uris',
  'server-configuration',
] as const;

export type RootsMigrationTarget = (typeof ROOTS_MIGRATION_TARGETS)[number];

/**
 * Returns `true` — the `roots` capability is Deprecated in this revision.
 * (R-21-a, R-21.1-a, R-21.1.1-a · SHOULD NOT; AC-32.1)
 *
 * Thin, intention-revealing wrapper over
 * `isDeprecatedClientCapability('roots')` so callers can assert the deprecation
 * status without hard-coding the name.
 */
export function isRootsDeprecated(): boolean {
  return isDeprecatedClientCapability(ROOTS_CAPABILITY_NAME);
}

/**
 * Returns `true` when `target` is a recommended migration mechanism a builder
 * SHOULD adopt for new functionality instead of roots. (R-21.1.1-b · SHOULD;
 * AC-32.1)
 *
 * The string `"roots"` is intentionally NOT a member, so passing it returns
 * `false` — roots MUST NOT be adopted for new functionality.
 */
export function isRecommendedMigrationTarget(target: string): target is RootsMigrationTarget {
  return (ROOTS_MIGRATION_TARGETS as readonly string[]).includes(target);
}

// ─── `roots` capability value (§21.1.2 / §6.1) ─────────────────────────────────

/**
 * The value of the `roots` key in the client-capabilities object. (§21.1.2,
 * R-21.1.2-a · MUST)
 *
 * ⚠️ DEPRECATED. An object with NO defined members in this revision; the empty
 * object `{}` is the canonical value. Presence of the key (with any object
 * value) signals support for roots-listing; absence signals no support.
 * `.passthrough()` keeps unrecognized members so a receiver IGNORES rather than
 * rejects them. (R-21.1.2-b · MUST) No `listChanged` sub-flag is defined; this
 * schema deliberately declares none. (R-21.1.2-c · MUST NOT)
 *
 * A value that is NOT a JSON object (e.g. `true`, `[]`, `"x"`) is invalid.
 * (AC-32.3)
 *
 * @deprecated Roots is a Deprecated client capability (§27.3). No direct
 * replacement; roots integration is now host-managed. Earliest removal:
 * 2026-07-28 (§27.2/§27.3, R-27.4-a/-b).
 */
export const RootsCapabilitySchema = z.record(z.unknown());

export type RootsCapability = z.infer<typeof RootsCapabilitySchema>;

/**
 * Returns `true` when `value` is a valid `roots` capability VALUE: any JSON
 * object (canonically `{}`). (R-21.1.2-a · MUST; AC-32.3)
 *
 * Non-object values are rejected; unrecognized object members are tolerated
 * (they do not make the value invalid). (R-21.1.2-b · MUST; AC-32.4)
 */
export function isValidRootsCapabilityValue(value: unknown): value is RootsCapability {
  return isPlainObject(value);
}

/**
 * Returns `true` when the client-capabilities object `caps` declares the
 * (Deprecated) `roots` capability. (R-21.1.2-a; AC-32.4)
 *
 * Thin wrapper over `clientDeclares(caps, 'roots')`: presence of an OBJECT
 * `roots` value means declared, even when it carries unrecognized members — the
 * capability is NOT rejected for those. (R-21.1.2-b · MUST)
 */
export function declaresRoots(caps: Record<string, unknown>): boolean {
  return clientDeclares(caps, ROOTS_CAPABILITY_NAME);
}

// ─── `listChanged` non-existence (§21.1.2, R-21.1.2-c) ─────────────────────────

/**
 * `false` — this revision defines NO `listChanged` sub-flag for the `roots`
 * capability. (R-21.1.2-c · MUST NOT; AC-32.5)
 *
 * A client MUST NOT rely on any `listChanged`-style change-notification
 * mechanism for roots in this revision. The notification method name and a
 * predicate that confirms it is unsupported are provided below so callers can
 * assert (rather than assume) its absence.
 */
export const ROOTS_LIST_CHANGED_SUPPORTED = false as const;

/**
 * The `notifications/roots/list_changed` notification method name.
 *
 * ⚠️ DEPRECATED / UNSUPPORTED in this revision. No `listChanged` sub-flag is
 * defined for the `roots` capability, so this notification is NOT gated by any
 * sub-flag and a client MUST NOT rely on it to convey root-set changes.
 * (R-21.1.2-c · MUST NOT; AC-32.5) The name is exposed only so a receiver can
 * recognize and ignore it; {@link mayRelyOnRootsListChanged} returns `false`.
 */
export const ROOTS_LIST_CHANGED_NOTIFICATION_METHOD =
  'notifications/roots/list_changed' as const;

/**
 * Returns `false` for every input — a client MUST NOT rely on a
 * `listChanged`-style change-notification mechanism for roots in this revision,
 * regardless of what the `roots` capability value contains. (R-21.1.2-c ·
 * MUST NOT; AC-32.5)
 *
 * @param _clientCaps - The client-capabilities object (unused; no sub-flag
 *   exists that could enable this, so the answer is always `false`).
 */
export function mayRelyOnRootsListChanged(_clientCaps: Record<string, unknown>): boolean {
  return ROOTS_LIST_CHANGED_SUPPORTED;
}

// ─── Server-side gating (§21.1.2, R-21.1.2-d / -e) ─────────────────────────────

/** Outcome of {@link decideRootsRequest}. */
export type RootsRequestDecision =
  /** The client declared `roots`; the server MAY embed a `roots/list` input request. */
  | { action: 'request' }
  /** The client did NOT declare `roots`; the server MUST proceed without roots. */
  | { action: 'proceed-without-roots' };

/**
 * Decides whether a server may request a roots listing from a client, given the
 * client's declared capabilities. (R-21.1.2-d · MUST NOT, R-21.1.2-e · MUST;
 * AC-32.6)
 *
 * - When the client declares `roots`        → `{ action: 'request' }`.
 * - When the client does NOT declare `roots` → `{ action: 'proceed-without-roots' }`.
 *   A server MUST NOT request roots from such a client and MUST proceed without
 *   them.
 *
 * Gating reuses `mayInvokeRootsList` (S10); this is the §21.1-level decision
 * wrapper expressing the proceed-without-roots fallback.
 */
export function decideRootsRequest(clientCaps: Record<string, unknown>): RootsRequestDecision {
  return mayInvokeRootsList(clientCaps) ? { action: 'request' } : { action: 'proceed-without-roots' };
}

// ─── The `roots/list` input request (§21.1.4) ──────────────────────────────────

/**
 * The exact `roots/list` method discriminator. MUST be exactly this string,
 * case-sensitive. (R-21.1.4-a · REQUIRED; AC-32.8)
 */
export const ROOTS_LIST_METHOD = 'roots/list' as const;

/**
 * Returns `true` when `value` is EXACTLY the `"roots/list"` method string
 * (case-sensitive). A value differing only in case (e.g. `"Roots/List"`) is
 * NOT valid. (R-21.1.4-a · REQUIRED; AC-32.8)
 */
export function isRootsListMethod(value: unknown): value is typeof ROOTS_LIST_METHOD {
  return value === ROOTS_LIST_METHOD;
}

/**
 * Validates a `roots/list` input request — the request a server embeds in an
 * input-required result to obtain roots. (§21.1.4; AC-32.8, AC-32.9)
 *
 * ⚠️ DEPRECATED. Built on `RootsListInputRequestSchema` (S17): `method` is
 * REQUIRED and MUST be exactly `"roots/list"` (R-21.1.4-a); `params` is
 * OPTIONAL, carries no roots-specific members, and MAY carry only the common
 * `_meta` member (R-21.1.4-b). A receiver MUST tolerate the ABSENCE of `params`
 * (R-21.1.4-c) — the underlying schema marks it `.optional()`, so a request
 * with no `params` parses successfully.
 *
 * @param value - The candidate input request.
 * @returns A discriminated result; `.success` is `false` for a wrong/miscased
 *   `method` or a non-object `params`.
 */
export function parseRootsListInputRequest(
  value: unknown,
): z.SafeParseReturnType<unknown, z.infer<typeof RootsListInputRequestSchema>> {
  return RootsListInputRequestSchema.safeParse(value);
}

// ─── The `Root` entry (§21.1.5) ────────────────────────────────────────────────

/**
 * Returns `true` when `uri` is a syntactically valid absolute URI per RFC 3986
 * AND uses the `file` scheme (begins with `file://`). (R-21.1.5-b, R-21.1.5-d ·
 * MUST; AC-32.11)
 *
 * Uses the WHATWG `URL` parser (RFC 3986-compatible) to reject malformed URIs,
 * then asserts the `file:` scheme and the authority-introducing `//`. A
 * non-`file` scheme, a missing/empty value, or a malformed URI all return
 * `false`.
 */
export function isValidFileUri(uri: unknown): uri is string {
  if (typeof uri !== 'string' || uri.length === 0) return false;
  // MUST begin with the `file://` scheme+authority marker. (R-21.1.5-b)
  if (!uri.startsWith('file://')) return false;
  try {
    // RFC 3986 syntactic validity via the WHATWG URL parser. (R-21.1.5-d)
    const parsed = new URL(uri);
    return parsed.protocol === 'file:';
  } catch {
    return false;
  }
}

/**
 * Returns `true` when `uri`, after passing {@link isValidFileUri}, shows NO
 * path-traversal artifacts — no `..` path segment and no percent-encoded `..`
 * (`%2e%2e`). (R-21.1.5-i · SHOULD; AC-32.16)
 *
 * A client SHOULD validate every root `uri` to guard against path-traversal
 * before exposing it. This is the SHOULD-level guard layered on top of the
 * MUST-level `file://` + RFC 3986 check.
 *
 * The check inspects the RAW input rather than the parsed `URL.pathname`,
 * because the WHATWG `URL` parser silently resolves (collapses) `..` segments —
 * so `file:///home/../etc` would parse to `/etc` and hide the artifact. We
 * therefore scan the raw path portion's segments, decoding each once to catch
 * percent-encoded dot-dot (`%2e%2e`).
 */
export function isPathTraversalSafe(uri: unknown): boolean {
  if (!isValidFileUri(uri)) return false;
  // Strip the `file://` scheme+authority marker, then drop the authority
  // (everything up to the first `/`) to isolate the raw path portion.
  const afterScheme = (uri as string).slice('file://'.length);
  const firstSlash = afterScheme.indexOf('/');
  if (firstSlash === -1) return true; // no path portion (e.g. `file://host`)
  const rawPath = afterScheme.slice(firstSlash);
  for (const segment of rawPath.split('/')) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      // A malformed escape sequence is itself suspicious — treat as unsafe.
      return false;
    }
    if (decoded === '..') return false;
  }
  return true;
}

/**
 * A single exposed root entry. (§21.1.5; AC-32.11, AC-32.13, AC-32.14)
 *
 * ⚠️ DEPRECATED. Identifies a directory or file the client considers relevant.
 * Roots are informational guidance, NOT an enforced access boundary.
 *
 * Fields:
 *   `uri`   REQUIRED string. MUST begin with `file://` and be a syntactically
 *           valid URI per RFC 3986. (R-21.1.5-b, R-21.1.5-d · MUST; AC-32.11)
 *   `name`  OPTIONAL human-readable display name; when absent, no display name
 *           is implied. (R-21.1.5-e · OPTIONAL; AC-32.13)
 *   `_meta` OPTIONAL implementation-defined metadata map; a receiver MUST
 *           IGNORE members it does not recognize — `.passthrough()` preserves
 *           them through parse. (R-21.1.5-f · MUST; AC-32.14)
 *
 * This is the strongly-validated `file://` form. The S17 `ListRootsResultSchema`
 * accepts any string `uri` (it owns only the array-presence constraint); this
 * schema layers the §21.1 `file://` + RFC 3986 constraint via a refinement.
 */
export const RootSchema = z
  .object({
    /** REQUIRED `file://` URI, syntactically valid per RFC 3986. (R-21.1.5-b, R-21.1.5-d) */
    uri: z.string().refine(isValidFileUri, {
      message: 'Root.uri MUST begin with "file://" and be a valid RFC 3986 URI (R-21.1.5-b, R-21.1.5-d)',
    }),
    /** OPTIONAL human-readable display name. (R-21.1.5-e) */
    name: z.string().optional(),
    /** OPTIONAL implementation-defined metadata; unrecognized members ignored. (R-21.1.5-f) */
    _meta: z.record(z.unknown()).optional(),
  })
  .passthrough();

export type Root = z.infer<typeof RootSchema>;

/**
 * Validates a single `Root`, enforcing the §21.1 `uri` constraints. (§21.1.5;
 * AC-32.11, AC-32.13)
 *
 * A missing, non-`file`, or malformed `uri` fails; a present string `name` and
 * unrecognized `_meta` members are accepted. (R-21.1.5-b, -d, -e, -f)
 */
export function parseRoot(value: unknown): z.SafeParseReturnType<unknown, Root> {
  return RootSchema.safeParse(value);
}

// ─── Non-`file`-scheme handling (§21.1.5, R-21.1.5-c) ──────────────────────────

/** A receiver's permitted disposition of a root whose `uri` is not `file`-scheme. */
export type NonFileRootDisposition = 'reject' | 'ignore';

/**
 * Returns `true` when `disposition` is a CONFORMANT way to handle a root whose
 * `uri` does not use the `file` scheme: a receiver MAY either `'reject'` it or
 * `'ignore'` it. (R-21.1.5-c · MAY; AC-32.12)
 *
 * Both dispositions are conformant; this predicate exists so a receiver can
 * assert its chosen policy is one the spec permits.
 */
export function isConformantNonFileDisposition(
  disposition: string,
): disposition is NonFileRootDisposition {
  return disposition === 'reject' || disposition === 'ignore';
}

/**
 * Applies a receiver's chosen `disposition` to a candidate root `uri` that does
 * NOT use the `file` scheme, returning whether the root is kept. (R-21.1.5-c ·
 * MAY; AC-32.12)
 *
 * - A `file://` `uri` is always kept (this rule only governs non-`file` URIs).
 * - A non-`file` `uri` is dropped (kept = `false`) under EITHER disposition;
 *   `'reject'` and `'ignore'` differ only in whether the receiver surfaces an
 *   error elsewhere — both remove the root from consideration here.
 *
 * @param uri         - The candidate root URI.
 * @param disposition - `'reject'` or `'ignore'`.
 */
export function applyNonFileDisposition(uri: unknown, disposition: NonFileRootDisposition): {
  kept: boolean;
  disposition: NonFileRootDisposition;
} {
  if (isValidFileUri(uri)) return { kept: true, disposition };
  return { kept: false, disposition };
}

// ─── ListRootsResult (§21.1.5) ─────────────────────────────────────────────────

/**
 * The `ListRootsResult` a client supplies on retry, with §21.1 `Root`
 * validation. (§21.1.5; AC-32.10, AC-32.11)
 *
 * ⚠️ DEPRECATED. `roots` is REQUIRED; it MAY be empty (`[]`) to indicate no
 * exposed roots but MUST be present even when empty. (R-21.1.5-a · REQUIRED;
 * AC-32.10) Each entry MUST satisfy {@link RootSchema} (`file://` +
 * RFC 3986). (R-21.1.5-b, R-21.1.5-d; AC-32.11)
 *
 * This is the STRICT form; the S17 `ListRootsResultSchema` (re-exported above)
 * is the lenient cross-cutting form that validates only the array's presence.
 * Use this when a receiver wants the full §21.1 `uri` enforcement.
 */
export const StrictListRootsResultSchema = z
  .object({
    /** REQUIRED array of `Root`; MAY be empty but MUST be present. (R-21.1.5-a) */
    roots: z.array(RootSchema),
  })
  .passthrough();

export type StrictListRootsResult = z.infer<typeof StrictListRootsResultSchema>;

/**
 * Validates a `ListRootsResult` with full §21.1 `Root` enforcement. (§21.1.5;
 * AC-32.10, AC-32.11)
 *
 * A result missing `roots` fails; `{ roots: [] }` succeeds ("no roots
 * exposed"); a result whose every `Root` carries a valid `file://` `uri`
 * succeeds; any non-`file`/malformed/missing `uri` fails.
 */
export function parseStrictListRootsResult(
  value: unknown,
): z.SafeParseReturnType<unknown, StrictListRootsResult> {
  return StrictListRootsResultSchema.safeParse(value);
}

// ─── Client-side assembly: consent, scope, validation (§21.1.5) ────────────────

/** A candidate root a client is considering exposing, paired with consent state. */
export interface RootCandidate {
  /** The candidate root entry. */
  root: Root;
  /** Whether the user has consented to exposing this root. (R-21.1.5-h · SHOULD) */
  consented: boolean;
  /** Whether the client intends the server to treat this root as in-scope. (R-21.1.5-g · MUST) */
  inScope: boolean;
}

/** Outcome of {@link assembleListRootsResult}. */
export interface RootsAssembly {
  /** The validated listing to supply as the `roots/list` input response. */
  result: StrictListRootsResult;
  /** Candidates excluded, with the reason each was dropped. */
  excluded: Array<{ root: Root; reason: 'not-in-scope' | 'no-consent' | 'invalid-uri' | 'path-traversal' }>;
}

/**
 * Assembles a `ListRootsResult` a client supplies on retry, enforcing the
 * client-side consent, scope, and validation obligations. (§21.1.5; AC-32.10,
 * AC-32.15, AC-32.16)
 *
 * ⚠️ DEPRECATED. From the candidates, a root is INCLUDED only when it is:
 *   - in-scope — the client intends the server to treat it as in-scope
 *     (R-21.1.5-g · MUST; AC-32.15), AND
 *   - consented — the user has consented to exposing it (R-21.1.5-h · SHOULD;
 *     AC-32.15), AND
 *   - URI-valid — its `uri` is a valid `file://` URI (R-21.1.5-b, -d), AND
 *   - traversal-safe — its `uri` shows no path-traversal artifacts
 *     (R-21.1.5-i · SHOULD; AC-32.16).
 *
 * Every excluded candidate is reported with its reason. When NO candidate
 * qualifies, the result is the conformant empty listing `{ roots: [] }`.
 * (R-21.1.5-a; AC-32.10)
 *
 * @param candidates - The roots the client is considering exposing.
 */
export function assembleListRootsResult(candidates: readonly RootCandidate[]): RootsAssembly {
  const included: Root[] = [];
  const excluded: RootsAssembly['excluded'] = [];

  for (const candidate of candidates) {
    if (!candidate.inScope) {
      excluded.push({ root: candidate.root, reason: 'not-in-scope' });
      continue;
    }
    if (!candidate.consented) {
      excluded.push({ root: candidate.root, reason: 'no-consent' });
      continue;
    }
    if (!isValidFileUri(candidate.root.uri)) {
      excluded.push({ root: candidate.root, reason: 'invalid-uri' });
      continue;
    }
    if (!isPathTraversalSafe(candidate.root.uri)) {
      excluded.push({ root: candidate.root, reason: 'path-traversal' });
      continue;
    }
    included.push(candidate.root);
  }

  return { result: { roots: included }, excluded };
}

// ─── Server-side: non-enforcement, tolerance, path validation (§21.1.5) ────────

/**
 * `false` — a server MUST NOT assume the protocol enforces root boundaries on
 * its behalf; roots are informational guidance, not an access-control
 * mechanism. (R-21.1.5-l · MUST NOT; AC-32.18)
 *
 * Exposed as a named constant so server code can assert it never relies on
 * protocol-level enforcement.
 */
export const PROTOCOL_ENFORCES_ROOT_BOUNDARIES = false as const;

/**
 * Returns `false` — confirms the protocol does NOT enforce root boundaries; a
 * server MUST validate derived paths itself rather than assuming enforcement.
 * (R-21.1.5-l · MUST NOT; AC-32.18)
 */
export function protocolEnforcesRootBoundaries(): boolean {
  return PROTOCOL_ENFORCES_ROOT_BOUNDARIES;
}

/**
 * Returns `true` when a server SHOULD tolerate a previously-reported root that
 * has since become unavailable, i.e. it MUST NOT fail solely because a reported
 * root is now gone. (R-21.1.5-j · SHOULD; AC-32.17)
 *
 * Always `true`: the server tolerates unavailability rather than failing.
 *
 * @param _root - The previously-reported root that is now unavailable (unused;
 *   tolerance does not depend on which root).
 */
export function shouldTolerateUnavailableRoot(_root: Root): boolean {
  return true;
}

/**
 * Validates a server-derived filesystem path against the reported roots, so the
 * server does NOT rely on protocol-level enforcement. (R-21.1.5-k · SHOULD,
 * R-21.1.5-l · MUST NOT; AC-32.18)
 *
 * Returns `true` only when `derivedUri` is a valid `file://` URI whose path is
 * contained within (equal to, or a descendant of) at least one reported root's
 * path. A path outside every reported root returns `false`; the server SHOULD
 * act on this rather than assume the protocol blocked it.
 *
 * Containment compares decoded path segments (so `/a/b` contains `/a/b/c` but
 * not `/a/bc`); roots whose own `uri` is invalid are skipped.
 *
 * @param derivedUri    - The `file://` URI the server derived from the request.
 * @param reportedRoots - The roots the client reported in its `ListRootsResult`.
 */
export function isPathWithinReportedRoots(
  derivedUri: unknown,
  reportedRoots: readonly Root[],
): boolean {
  if (!isValidFileUri(derivedUri)) return false;
  const derivedSegments = decodedSegments(new URL(derivedUri).pathname);

  for (const root of reportedRoots) {
    if (!isValidFileUri(root.uri)) continue;
    const rootSegments = decodedSegments(new URL(root.uri).pathname);
    if (isPrefixPath(rootSegments, derivedSegments)) return true;
  }
  return false;
}

/** Splits a URL pathname into non-empty, percent-decoded path segments. */
function decodedSegments(pathname: string): string[] {
  return pathname
    .split('/')
    .filter((s) => s.length > 0)
    .map((s) => {
      try {
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    });
}

/** Returns `true` when `prefix` is a path-prefix of (or equal to) `path`. */
function isPrefixPath(prefix: readonly string[], path: readonly string[]): boolean {
  if (prefix.length > path.length) return false;
  for (let i = 0; i < prefix.length; i += 1) {
    if (prefix[i] !== path[i]) return false;
  }
  return true;
}
