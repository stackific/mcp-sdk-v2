/**
 * S09 — Revision Selection & Negotiation Errors (§5.4–§5.7).
 *
 * Turns the raw materials discovery (S08) produces — a set of advertised
 * revisions and capabilities — into a chosen protocol revision, and defines the
 * recovery path when a request is rejected. It provides:
 *
 *   - The client **revision-selection rule** (§5.4): pick the highest mutually
 *     supported revision, i.e. the first in the client's own preference order
 *     that also appears in the server's set; never fabricate one; surface an
 *     actionable incompatibility when the intersection is empty.
 *   - The two **negotiation errors** (§5.5, §5.6): `UnsupportedProtocolVersion`
 *     (`-32004`) and `MissingRequiredClientCapability` (`-32003`), both mapped to
 *     HTTP `400 Bad Request`, plus the client's retry reactions.
 *   - The **§5.7 backward-compatibility probe**: interpret a `server/discover`
 *     response as "supports this family", "supports the family but not the
 *     requested revision", or "does not speak this protocol", and a per-endpoint
 *     support-determination cache.
 *
 * The two error codes/builders are defined in their first-needed home (S08
 * discovery.ts for `-32004`; S05 meta.ts for `-32003`) and re-exported here so
 * that the full negotiation surface lives behind one module — the same
 * binding, not a duplicate.
 */

import {
  UNSUPPORTED_PROTOCOL_VERSION_CODE,
  selectRevision,
  isDiscoverResult,
  type UnsupportedProtocolVersionError,
  type DiscoverResult,
} from './discovery.js';
import { MISSING_CLIENT_CAPABILITY_CODE } from './meta.js';

// ─── Re-exported negotiation error surface ─────────────────────────────────────

export {
  UNSUPPORTED_PROTOCOL_VERSION_CODE,
  buildUnsupportedProtocolVersionError,
} from './discovery.js';
export type {
  UnsupportedProtocolVersionData,
  UnsupportedProtocolVersionError,
} from './discovery.js';
export {
  MISSING_CLIENT_CAPABILITY_CODE,
  buildMissingCapabilityError,
} from './meta.js';
export type { MissingCapabilityErrorData } from './meta.js';

// ─── HTTP status mapping (§5.5, §5.6) ──────────────────────────────────────────

/** Both negotiation errors are carried with HTTP `400 Bad Request`. (R-5.5-b, R-5.6-d) */
export const NEGOTIATION_ERROR_HTTP_STATUS = 400 as const;

/**
 * Returns `400` when `code` is one of the two negotiation error codes
 * (`-32004`, `-32003`), which on the HTTP transport MUST ride a
 * `400 Bad Request`; `undefined` otherwise. (R-5.5-b, R-5.6-d)
 */
export function httpStatusForNegotiationError(
  code: number,
): typeof NEGOTIATION_ERROR_HTTP_STATUS | undefined {
  return code === UNSUPPORTED_PROTOCOL_VERSION_CODE || code === MISSING_CLIENT_CAPABILITY_CODE
    ? NEGOTIATION_ERROR_HTTP_STATUS
    : undefined;
}

// ─── Revision selection (§5.4) ─────────────────────────────────────────────────

/**
 * Whether `server/discover` is required before a first substantive request.
 *
 * It is OPTIONAL (R-5.4-a): a client MAY probe with `server/discover` first, or
 * MAY proceed directly by declaring a revision on its first request and handling
 * an `UnsupportedProtocolVersion` rejection. The selection logic here is driven
 * purely by a client preference list and a server set — and that server set can
 * come from a discovery result *or* from a rejection's `data.supported`, so
 * negotiation never depends on a prior discovery call.
 */
export const SERVER_DISCOVER_IS_OPTIONAL = true as const;

/** Outcome of the revision-selection rule. */
export type RevisionNegotiationResult =
  | { ok: true; selected: string }
  | { ok: false; reason: 'no-mutual-revision'; clientPreference: string[]; serverSupported: string[] };

/**
 * Selects the highest mutually supported protocol revision. (§5.4, R-5.4-b)
 *
 * "Highest" means the first revision in the client's own ordered preference
 * list that also appears in the server's set — matching is exact (S07), never
 * lexical/chronological. When the intersection is empty the result is
 * `{ ok: false, reason: 'no-mutual-revision' }`: the client MUST NOT fabricate a
 * revision (R-5.4-c) and SHOULD surface an incompatibility (R-5.4-d) via
 * {@link IncompatibleProtocolError}.
 *
 * @param clientPreference - The client's acceptable revisions, most-preferred first.
 * @param serverSupported  - The server's advertised revisions (order ignored).
 */
export function negotiateRevision(
  clientPreference: readonly string[],
  serverSupported: readonly string[],
): RevisionNegotiationResult {
  const selected = selectRevision(serverSupported, clientPreference);
  if (selected === undefined) {
    return {
      ok: false,
      reason: 'no-mutual-revision',
      clientPreference: [...clientPreference],
      serverSupported: [...serverSupported],
    };
  }
  return { ok: true, selected };
}

/**
 * An actionable error a client surfaces to its caller when no protocol revision
 * is mutually supported. (R-5.4-d, R-5.5-j) Carries both sides' revision sets
 * for diagnostics. Distinct from a wire error — it never goes on the wire.
 */
export class IncompatibleProtocolError extends Error {
  readonly code = 'INCOMPATIBLE_PROTOCOL' as const;
  readonly clientPreference: readonly string[];
  readonly serverSupported: readonly string[];

  constructor(clientPreference: readonly string[], serverSupported: readonly string[]) {
    super(
      `No mutually supported protocol revision: client prefers [${clientPreference.join(', ')}], ` +
        `server supports [${serverSupported.join(', ')}]`,
    );
    this.name = 'IncompatibleProtocolError';
    this.clientPreference = [...clientPreference];
    this.serverSupported = [...serverSupported];
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ─── Client reaction to UnsupportedProtocolVersion (§5.5) ──────────────────────

/**
 * Reacts to an `UnsupportedProtocolVersion` (`-32004`) error by re-selecting a
 * revision from the error's authoritative `data.supported` set. (R-5.5-h)
 *
 * Returns `{ ok: true, selected }` to retry the original request with `selected`
 * declared in `io.modelcontextprotocol/protocolVersion` (and the matching
 * `MCP-Protocol-Version` header on HTTP). Returns `{ ok: false }` when no
 * mutually supported revision exists — the client MUST NOT retry indefinitely
 * (R-5.5-i) and SHOULD surface an incompatibility (R-5.5-j); because this is a
 * pure re-selection over the server's set, an empty result is terminal.
 *
 * @param error            - The `-32004` error object (its `data.supported` is used).
 * @param clientPreference - The client's acceptable revisions, most-preferred first.
 */
export function reselectAfterUnsupportedVersion(
  error: UnsupportedProtocolVersionError,
  clientPreference: readonly string[],
): RevisionNegotiationResult {
  return negotiateRevision(clientPreference, error.data.supported);
}

// ─── Client reaction to MissingRequiredClientCapability (§5.6) ─────────────────

/**
 * Returns `true` when the client can declare every capability the server named
 * as required — i.e. each required capability key is one the client supports.
 * (R-5.6-i)
 *
 * @param requiredCapabilities - The error's `data.requiredCapabilities`.
 * @param clientSupported      - The capabilities the client is able to offer.
 */
export function canSatisfyRequiredCapabilities(
  requiredCapabilities: Record<string, unknown>,
  clientSupported: Record<string, unknown>,
): boolean {
  return Object.keys(requiredCapabilities).every((key) =>
    Object.prototype.hasOwnProperty.call(clientSupported, key),
  );
}

/**
 * Produces the `clientCapabilities` object for a retry after a
 * `MissingRequiredClientCapability` (`-32003`) error: the originally declared
 * capabilities merged with the required ones. (R-5.6-i)
 *
 * The merge is shallow — a required capability's settings object replaces any
 * previously declared value for that key — and never mutates its inputs.
 */
export function augmentClientCapabilities(
  declared: Record<string, unknown>,
  requiredCapabilities: Record<string, unknown>,
): Record<string, unknown> {
  return { ...declared, ...requiredCapabilities };
}

// ─── Backward-compatibility probe (§5.7) ───────────────────────────────────────

/** The method a client sends as its opening probe request. (R-5.7-b) */
export { SERVER_DISCOVER_METHOD } from './discovery.js';

/** Outcome of interpreting a probe (`server/discover`) response. (§5.7) */
export type ProbeOutcome =
  /** A valid `DiscoverResult`: the server speaks this protocol family. */
  | { kind: 'supported'; supportedVersions: string[]; result: DiscoverResult }
  /** A recognized `-32004`: speaks the family, not the requested revision. */
  | { kind: 'unsupported-version'; supported: string[]; requested: string }
  /** Anything else: the server does not speak this protocol revision. */
  | { kind: 'not-this-protocol'; reason: string };

/** Returns `true` when `value` is a non-null, non-array object. */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Interprets a response to a probe `server/discover` request. (§5.7)
 *
 * Classification:
 *   - A success carrying a valid `DiscoverResult` → `'supported'`; the client
 *     reads `supportedVersions` and applies the selection rule.
 *   - A recognized `UnsupportedProtocolVersion` (`-32004`) error whose `data`
 *     carries `supported` → `'unsupported-version'`; the client re-selects from
 *     `data.supported` rather than abandoning the protocol.
 *   - Anything else — a different error code, a malformed response, or no
 *     response (pass `undefined`/`null` for a transport timeout) — →
 *     `'not-this-protocol'`: the client MUST treat the server as not speaking
 *     this protocol revision. (R-5.7-c)
 *
 * @param response - The JSON-RPC response object, or `null`/`undefined` for a timeout.
 */
export function interpretProbeResponse(response: unknown): ProbeOutcome {
  if (!isObject(response)) {
    return { kind: 'not-this-protocol', reason: 'no response (timeout) or non-object response' };
  }

  // Success branch: a result carrying a valid DiscoverResult.
  if ('result' in response && !('error' in response)) {
    const result = response['result'];
    if (isDiscoverResult(result)) {
      return { kind: 'supported', supportedVersions: [...result.supportedVersions], result };
    }
    return { kind: 'not-this-protocol', reason: 'result is not a valid DiscoverResult' };
  }

  // Error branch: only a recognized -32004 with data.supported is "this protocol".
  if ('error' in response && isObject(response['error'])) {
    const error = response['error'];
    const data = error['data'];
    if (
      error['code'] === UNSUPPORTED_PROTOCOL_VERSION_CODE &&
      isObject(data) &&
      Array.isArray(data['supported']) &&
      typeof data['requested'] === 'string'
    ) {
      return {
        kind: 'unsupported-version',
        supported: data['supported'] as string[],
        requested: data['requested'],
      };
    }
    return { kind: 'not-this-protocol', reason: `unrecognized error code ${String(error['code'])}` };
  }

  return { kind: 'not-this-protocol', reason: 'response is neither a result nor an error' };
}

/**
 * Adds the server's supported revisions to an error's `data.supported`, so a
 * peer with no fall-forward mechanism can still surface a useful diagnostic.
 * (R-5.7-g)
 *
 * A server implementing only this protocol family SHOULD name its revisions in
 * any error it returns for an opening request it cannot interpret. Existing
 * `data` fields are preserved; `supported` is set/overwritten with the list.
 *
 * @param baseError - The error object to annotate (`code`/`message` required).
 * @param supported - The protocol revisions the server supports.
 */
export function nameSupportedRevisionsInError<E extends { code: number; message: string; data?: unknown }>(
  baseError: E,
  supported: readonly string[],
): E & { data: Record<string, unknown> & { supported: string[] } } {
  const existingData = isObject(baseError.data) ? baseError.data : {};
  return {
    ...baseError,
    data: { ...existingData, supported: [...supported] },
  };
}

// ─── Protocol-support determination cache (§5.7) ───────────────────────────────

/** A per-endpoint conclusion about whether a server speaks this protocol family. */
export type ProtocolSupportDetermination =
  | { speaksProtocol: true; supportedVersions: string[] }
  | { speaksProtocol: false };

/**
 * Caches the protocol-support determination per server endpoint. (R-5.7-e)
 *
 * The determination is a property of the server endpoint, not of an individual
 * request, so a client SHOULD cache it for the lifetime of the connected server
 * process. A client MAY persist it across restarts of the same server
 * configuration (use {@link entries} / {@link fromEntries}) and re-probe — via
 * {@link invalidate} — if a cached assumption later proves wrong. (R-5.7-f)
 *
 * Endpoints are identified by an opaque caller-chosen key (e.g. a stdio command
 * line or an HTTP endpoint URL).
 */
export class ProtocolSupportCache {
  private readonly determinations = new Map<string, ProtocolSupportDetermination>();

  /** Records a determination for `endpoint`. */
  set(endpoint: string, determination: ProtocolSupportDetermination): void {
    this.determinations.set(endpoint, determination);
  }

  /** Returns the cached determination for `endpoint`, or `undefined`. */
  get(endpoint: string): ProtocolSupportDetermination | undefined {
    return this.determinations.get(endpoint);
  }

  /** Returns `true` when a determination is cached for `endpoint`. */
  has(endpoint: string): boolean {
    return this.determinations.has(endpoint);
  }

  /** Drops the cached determination so the client re-probes. (R-5.7-f) */
  invalidate(endpoint: string): void {
    this.determinations.delete(endpoint);
  }

  /** Snapshot of all cached determinations, for persistence. (R-5.7-f) */
  entries(): Array<[string, ProtocolSupportDetermination]> {
    return Array.from(this.determinations.entries());
  }

  /** Rebuilds a cache from persisted {@link entries}. (R-5.7-f) */
  static fromEntries(entries: Iterable<[string, ProtocolSupportDetermination]>): ProtocolSupportCache {
    const cache = new ProtocolSupportCache();
    for (const [endpoint, determination] of entries) {
      cache.set(endpoint, determination);
    }
    return cache;
  }
}

/**
 * Derives a {@link ProtocolSupportDetermination} from a probe outcome, ready to
 * cache. Both `'supported'` and `'unsupported-version'` mean the server speaks
 * this protocol family (the latter just not the requested revision);
 * `'not-this-protocol'` means it does not. (R-5.7, R-5.7-c)
 */
export function determinationFromProbe(outcome: ProbeOutcome): ProtocolSupportDetermination {
  switch (outcome.kind) {
    case 'supported':
      return { speaksProtocol: true, supportedVersions: outcome.supportedVersions };
    case 'unsupported-version':
      return { speaksProtocol: true, supportedVersions: outcome.supported };
    case 'not-this-protocol':
      return { speaksProtocol: false };
  }
}
