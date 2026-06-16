/**
 * S45 — Conformance Requirements & References (§29–§30).
 *
 * The formal conformance contract: the precise, testable definition of what it
 * means for an MCP implementation to be conformant, decomposed along the three
 * independent axes of §29.1 — **role** (client / server / both), **feature
 * surface** (baseline plus whatever is advertised), and **transport** (each
 * transport implemented, independently). It restates, as a single machine-checkable
 * rulebook, the baseline obligations of every server and every client (§29.2,
 * §29.3), the bidirectional advertise⇔implement principle for capabilities and
 * extensions (§29.4, §29.5), the robustness rules for richer-than-understood
 * inputs (§29.6), the stateless-model invariants (§29.7), the transport
 * obligations (§29.8), the method for determining conformance (§29.9), and the
 * provenance-only status of the §30 reference markers.
 *
 * This is a conceptual, cross-cutting story: it defines NO new wire types. Its
 * artifacts are a registry of normative requirements ({@link CONFORMANCE_REQUIREMENTS}),
 * a requirement-level classifier ({@link classifyRequirementLevel}), the abstract
 * {@link ConformanceProfile} descriptor and its validator
 * ({@link validateConformanceProfile}), the baseline server request-disposition
 * predicate ({@link classifyServerRequest}), the capability→obligation map
 * ({@link CAPABILITY_OBLIGATIONS}), the robustness disposition
 * ({@link robustnessDisposition}), the stateless invariants
 * ({@link STATELESS_CONFORMANCE_INVARIANTS}), the transport-conformance evaluator
 * ({@link evaluateTransportConformance}), and the §30 citation status
 * ({@link CITATION_STATUS}).
 *
 * REUSE (never redefined here):
 *   - `ERROR_CODE_REGISTRY`, `classifyErrorCode`, `describeUnknownErrorCode`,
 *     `JsonRpcErrorObject` — `./errors.js` (S34);
 *   - `UNSUPPORTED_PROTOCOL_VERSION_CODE`, `MISSING_CLIENT_CAPABILITY_CODE`,
 *     `INVALID_PARAMS_CODE` — `./errors.js` / `./meta.js`;
 *   - `validateRequestMeta`, `CURRENT_PROTOCOL_VERSION`, `isSupportedProtocolVersion`,
 *     the per-request `_meta` envelope keys — `./meta.js` (S05);
 *   - `RESULT_TYPE`, `isKnownResultType`, `interpretResultType` — `../jsonrpc/payload.js` (S04);
 *   - `isResultTypeAccepted`, `isValidExtensionId`, `decideExtensionUse` — `./extension-mechanism.js` (S38);
 *   - `ClientCapabilityName`, `ServerCapabilityName`, `clientDeclares`,
 *     `serverDeclares`, `computeMissingClientCapabilities` — `./capability-negotiation.js` (S10);
 *   - `TransportFamily`, `authorizationAppliesTo`, `authorizationForbiddenFor`,
 *     `credentialConveyanceFor` — `./authorization.js` (S35/S37);
 *   - `mayEmitInputRequestKind` (the runtime-enforced input-kind gate) — `./multi-round-trip.js` (S17);
 *   - `FeatureStatus` — `./conformance.js` (S43, NOT redefined).
 *
 * Out of scope (owned elsewhere, per the story §5): the definition of the error
 * codes and their `data` shapes (S34), `server/discover` mechanics (S08/S09),
 * the `_meta` envelope / stateless-model definitions (S05/S06), the per-feature
 * MUST-level behaviors (S16–S31), the extension/Tasks/UI definitions (S38–S42),
 * deprecated features (S32/S33/S43), transport framing (S12–S15), the
 * authorization framework (S35–S37), and the consolidated registries (S46).
 */

import { isKnownResultType, interpretResultType } from '../jsonrpc/payload.js';
import {
  CURRENT_PROTOCOL_VERSION,
  isSupportedProtocolVersion,
  validateRequestMeta,
  PROTOCOL_VERSION_META_KEY,
  CLIENT_INFO_META_KEY,
  CLIENT_CAPABILITIES_META_KEY,
  INVALID_PARAMS_CODE,
  MISSING_CLIENT_CAPABILITY_CODE,
} from './meta.js';
import { UNSUPPORTED_PROTOCOL_VERSION_CODE } from './errors.js';
import {
  type ClientCapabilityName,
  type ServerCapabilityName,
  computeMissingClientCapabilities,
} from './capability-negotiation.js';
import { isResultTypeAccepted, isValidExtensionId } from './extension-mechanism.js';
import {
  type TransportFamily,
  authorizationAppliesTo,
  authorizationForbiddenFor,
  credentialConveyanceFor,
} from './authorization.js';
import { mayEmitInputRequestKind } from './multi-round-trip.js';

/** Returns `true` when `value` is a non-null, non-array object. */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// ─── §29.1 — The three conformance axes ─────────────────────────────────────────

/**
 * A role an implementation plays. A requirement naming a role binds an
 * implementation only when it plays that role; an implementation playing BOTH
 * MUST satisfy each role's requirements. (§29.1, R-29.1-a, R-29.1-b)
 */
export type ConformanceRole = 'client' | 'server';

/**
 * A transport an implementation may implement. Open-ended (`string`) because
 * §7's transport set is extensible, but the two core transports are named.
 * (§29.8, R-29.8-a)
 */
export type ConformanceTransport = 'stdio' | 'streamable-http' | (string & {});

/**
 * The three independent axes along which conformance is scoped. (§29.1)
 * Conformance is the product of these: an implementation is conformant iff every
 * applicable requirement on its chosen roles, advertised features, and
 * implemented transports is satisfied.
 *
 *   - `role`      — client / server / both (§29.1 item 1);
 *   - `feature`   — baseline plus advertised capabilities/extensions (§29.1 item 2);
 *   - `transport` — each transport, independently (§29.1 item 3).
 */
export type ConformanceAxis = 'role' | 'feature' | 'transport';

/** The three conformance axes, in spec order. (§29.1) */
export const CONFORMANCE_AXES: readonly ConformanceAxis[] = ['role', 'feature', 'transport'];

// ─── §2 / RFC 2119 — Requirement-level classifier ───────────────────────────────

/**
 * A normative requirement level, in the RFC 2119 / RFC 8174 sense as established
 * by §2. The `MAY`/`OPTIONAL`/`SHOULD` family is conditionally applicable; the
 * `MUST` family is unconditional. (§29.1, R-29.1-a)
 *
 *   - `MUST`     — also covers MUST NOT / REQUIRED / SHALL / SHALL NOT;
 *   - `SHOULD`   — also covers SHOULD NOT / RECOMMENDED;
 *   - `MAY`      — also covers OPTIONAL.
 */
export type RequirementLevel = 'MUST' | 'SHOULD' | 'MAY';

/**
 * Every distinct RFC 2119 keyword recognized in the story's atoms, mapped to its
 * canonical {@link RequirementLevel} family. (§2) The keys are the exact tokens
 * the story uses in its `[R-… · KEYWORD]` markers.
 */
export const REQUIREMENT_KEYWORDS = {
  MUST: 'MUST',
  'MUST NOT': 'MUST',
  REQUIRED: 'MUST',
  SHALL: 'MUST',
  'SHALL NOT': 'MUST',
  SHOULD: 'SHOULD',
  'SHOULD NOT': 'SHOULD',
  RECOMMENDED: 'SHOULD',
  MAY: 'MAY',
  OPTIONAL: 'MAY',
} as const satisfies Record<string, RequirementLevel>;

/** A normative keyword as it appears in a requirement marker. */
export type RequirementKeyword = keyof typeof REQUIREMENT_KEYWORDS;

/** The three requirement-level families, strongest first. (§2) */
export const REQUIREMENT_LEVELS: readonly RequirementLevel[] = ['MUST', 'SHOULD', 'MAY'];

/**
 * Classifies a normative `keyword` into its {@link RequirementLevel} family.
 * (§2) Returns `undefined` for an unrecognized token — never throws, so a
 * conformance harness can report rather than crash on a malformed marker.
 */
export function classifyRequirementLevel(keyword: string): RequirementLevel | undefined {
  return Object.prototype.hasOwnProperty.call(REQUIREMENT_KEYWORDS, keyword)
    ? REQUIREMENT_KEYWORDS[keyword as RequirementKeyword]
    : undefined;
}

/**
 * Returns `true` when `keyword` is a MANDATORY keyword (MUST / MUST NOT /
 * REQUIRED / SHALL / SHALL NOT): an absolute requirement whose violation is
 * non-conformance. (§2, R-29.1-a)
 */
export function isMandatoryKeyword(keyword: string): boolean {
  return classifyRequirementLevel(keyword) === 'MUST';
}

/**
 * Returns `true` when `keyword` is ADVISORY (SHOULD / SHOULD NOT / RECOMMENDED):
 * valid reasons may exist to deviate, but the full implications must be
 * understood and weighed. (§2)
 */
export function isAdvisoryKeyword(keyword: string): boolean {
  return classifyRequirementLevel(keyword) === 'SHOULD';
}

/**
 * Returns `true` when `keyword` is OPTIONAL (MAY / OPTIONAL): truly discretionary;
 * an implementation that omits the behavior remains conformant. (§2, §29.5)
 */
export function isOptionalKeyword(keyword: string): boolean {
  return classifyRequirementLevel(keyword) === 'MAY';
}

// ─── The conformance-requirement registry (§29) ─────────────────────────────────

/**
 * One normative requirement ("atom") of §29/§30, identified by its stable
 * requirement id, the section it belongs to, the role(s)/axis it binds, and its
 * RFC 2119 level. This is the data form of the story's §7 behavior table; a
 * conformance harness enumerates it to know exactly what to check.
 */
export interface ConformanceRequirement {
  /** The stable requirement id, e.g. `"R-29.2-h"`. (story §10 traceability) */
  readonly id: string;
  /** The §29/§30 subsection this atom belongs to, e.g. `"29.2"`. */
  readonly section: string;
  /** The RFC 2119 keyword exactly as the story marks it. (§2) */
  readonly keyword: RequirementKeyword;
  /** The canonical level family derived from {@link keyword}. */
  readonly level: RequirementLevel;
  /** Which conformance axis the requirement constrains. (§29.1) */
  readonly axis: ConformanceAxis;
  /** The role(s) the requirement binds; empty ⇒ binds every role. (§29.1) */
  readonly roles: readonly ConformanceRole[];
  /** A one-line restatement of the obligation. */
  readonly statement: string;
}

/** Builds a {@link ConformanceRequirement}, deriving `level` from `keyword`. */
function req(
  id: string,
  section: string,
  keyword: RequirementKeyword,
  axis: ConformanceAxis,
  roles: readonly ConformanceRole[],
  statement: string,
): ConformanceRequirement {
  return { id, section, keyword, level: REQUIREMENT_KEYWORDS[keyword], axis, roles, statement };
}

const BOTH: readonly ConformanceRole[] = ['client', 'server'];
const SERVER: readonly ConformanceRole[] = ['server'];
const CLIENT: readonly ConformanceRole[] = ['client'];

/**
 * The complete registry of §29/§30 normative requirements, in document order.
 * (§29.1–§29.9, §30) Each entry mirrors exactly one `[R-… · KEYWORD]` atom from
 * the story's §7; the keyword and level honor the spec verbatim. A conformance
 * suite iterates this to enumerate every applicable obligation for a profile
 * (see {@link requirementsForProfile}).
 */
export const CONFORMANCE_REQUIREMENTS: readonly ConformanceRequirement[] = [
  // §29.1 — Meaning of conformance
  req('R-29.1-a', '29.1', 'MUST', 'role', BOTH, 'Conformant iff every applicable normative requirement for the roles played and features advertised is satisfied.'),
  req('R-29.1-b', '29.1', 'MUST', 'role', BOTH, 'An implementation playing both client and server roles must satisfy each role’s requirements.'),
  req('R-29.1-c', '29.1', 'MUST', 'feature', BOTH, 'Every conformant implementation uses the §3 base message format for all protocol traffic.'),
  req('R-29.1-d', '29.1', 'MUST', 'feature', BOTH, 'Every conformant implementation operates under the stateless, per-request model of §4.'),
  req('R-29.1-e', '29.1', 'MUST NOT', 'feature', BOTH, 'Deriving protocol-significant state from connection/process/stream identity rather than the §4 envelope is non-conformant.'),
  req('R-29.1-f', '29.1', 'MAY', 'feature', BOTH, 'Requirements may be satisfied by any internal architecture in any language; only messages and observable behavior are constrained.'),

  // §29.2 — Baseline server conformance
  req('R-29.2-a', '29.2', 'MUST', 'role', SERVER, 'A server implements server/discover; its obligation to answer is unconditional.'),
  req('R-29.2-b', '29.2', 'MAY', 'role', CLIENT, 'A client may call server/discover before any other request, but is not obligated to.'),
  req('R-29.2-c', '29.2', 'MUST', 'role', SERVER, 'A server advertises its supported revisions and capabilities via server/discover, consistently with §6.'),
  req('R-29.2-d', '29.2', 'MUST NOT', 'role', SERVER, 'A server must not advertise a revision or capability whose required behavior it does not implement.'),
  req('R-29.2-e', '29.2', 'MUST', 'role', SERVER, 'A server honors the §4 per-request metadata envelope on every request.'),
  req('R-29.2-f', '29.2', 'MUST NOT', 'role', SERVER, 'A server must not infer protocol-significant state across requests, even on the same connection/process/stream.'),
  req('R-29.2-g', '29.2', 'MUST NOT', 'role', SERVER, 'A server must not require a client to reuse the same connection or process for related operations.'),
  req('R-29.2-h', '29.2', 'MUST', 'role', SERVER, 'An unsupported declared revision is rejected with -32004 whose data lists supported revisions and the requested one.'),
  req('R-29.2-i', '29.2', 'MUST', 'role', SERVER, 'A request needing an undeclared client capability is rejected with -32003 whose data.requiredCapabilities carries the ClientCapabilities.'),
  req('R-29.2-j', '29.2', 'MUST', 'role', SERVER, 'A request omitting any §4-required field is malformed and rejected with -32602 (Invalid params).'),
  req('R-29.2-k', '29.2', 'MUST', 'role', SERVER, 'A server sets the resultType discriminator on every successful result.'),
  req('R-29.2-l', '29.2', 'MUST', 'role', SERVER, 'The resultType value is drawn from the core set plus values contributed by advertised extensions only.'),
  req('R-29.2-m', '29.2', 'MUST', 'role', SERVER, 'A server gates every feature behind its advertised capability.'),
  req('R-29.2-n', '29.2', 'MUST NOT', 'role', SERVER, 'A server must not expose/exercise/depend on unadvertised behavior, nor solicit an undeclared client behavior.'),

  // §29.3 — Baseline client conformance
  req('R-29.3-a', '29.3', 'MUST', 'role', CLIENT, 'Every client request carries the protocol revision, client identity, and relevant client capabilities in per-request metadata.'),
  req('R-29.3-b', '29.3', 'MUST', 'role', CLIENT, 'A client sends a revision it supports and can select a mutually supported revision.'),
  req('R-29.3-c', '29.3', 'SHOULD', 'role', CLIENT, 'On a -32004 the client should reselect from the server’s supported list and retry, or surface an error if none overlaps.'),
  req('R-29.3-d', '29.3', 'MUST', 'role', CLIENT, 'A client treats designated-opaque values (cursors, requestState, subscription ids, handles) as opaque.'),
  req('R-29.3-e', '29.3', 'MUST NOT', 'role', CLIENT, 'A client must not inspect/parse/modify/assume anything about designated-opaque values.'),
  req('R-29.3-f', '29.3', 'MUST', 'role', CLIENT, 'When echoing an opaque value back, the client echoes the exact value unchanged.'),
  req('R-29.3-g', '29.3', 'MUST', 'role', CLIENT, 'A client can fulfill an input_required result for the capabilities it declares.'),
  req('R-29.3-h', '29.3', 'MUST', 'role', CLIENT, 'On an input_required carrying input requests, the client constructs the inputs before retrying.'),
  req('R-29.3-i', '29.3', 'MAY', 'role', CLIENT, 'If no input requests are present in an input_required result, the client may retry immediately.'),
  req('R-29.3-j', '29.3', 'MUST', 'role', CLIENT, 'The retry uses a distinct request id, echoes requestState exactly when provided, and omits it when none was provided.'),
  req('R-29.3-k', '29.3', 'MUST', 'role', CLIENT, 'A client interprets each result by its resultType and applies the §29.6 robustness rules to unrecognized values/fields/codes.'),

  // §29.4 — Capability-conditioned conformance
  req('R-29.4-a', '29.4', 'MUST', 'feature', BOTH, 'Advertising a capability binds the implementation to every MUST-level behavior defined for it.'),
  req('R-29.4-b', '29.4', 'MUST', 'feature', SERVER, 'A server advertising tools satisfies the tools requirements of §16.'),
  req('R-29.4-c', '29.4', 'MUST', 'feature', SERVER, 'A server advertising resources satisfies §17, and resource subscriptions additionally satisfy §10.'),
  req('R-29.4-d', '29.4', 'MUST', 'feature', SERVER, 'A server advertising prompts satisfies the prompts requirements of §18.'),
  req('R-29.4-e', '29.4', 'MUST', 'feature', SERVER, 'A server advertising completion satisfies the completion requirements of §19.'),
  req('R-29.4-f', '29.4', 'MUST', 'feature', CLIENT, 'A client advertising elicitation satisfies the elicitation requirements of §20.'),
  req('R-29.4-g', '29.4', 'MUST', 'feature', BOTH, 'Any party advertising a streaming or subscription capability satisfies the applicable requirements of §10.'),
  req('R-29.4-h', '29.4', 'MUST NOT', 'feature', BOTH, 'An implementation must not exercise/expose/depend on a feature it has not advertised.'),
  req('R-29.4-i', '29.4', 'MUST NOT', 'feature', SERVER, 'A server must not return a result type, solicit a client capability, or invoke a behavior outside what it advertised.'),
  req('R-29.4-j', '29.4', 'MUST NOT', 'feature', BOTH, 'An implementation must not advertise a capability whose required behavior it does not implement.'),
  req('R-29.4-k', '29.4', 'MUST NOT', 'feature', SERVER, 'A server must not rely on an undeclared client capability; if required, it responds with -32003.'),
  req('R-29.4-l', '29.4', 'MUST NOT', 'feature', SERVER, 'A server must not place an input request of a kind the client has not declared into an input_required result.'),
  req('R-29.4-m', '29.4', 'MUST', 'feature', BOTH, 'For a deprecated client-provided capability, an implementation that advertises one implements its specified behavior.'),
  req('R-29.4-n', '29.4', 'MUST NOT', 'feature', BOTH, 'For a deprecated client-provided capability, an implementation that does not advertise one must not rely on it.'),

  // §29.5 — Optionality of extensions and deprecated features
  req('R-29.5-a', '29.5', 'OPTIONAL', 'feature', BOTH, 'The extension mechanism, Tasks, and UI extensions are optional; advertising zero extensions is fully conformant.'),
  req('R-29.5-b', '29.5', 'MUST', 'feature', BOTH, 'An implementation advertising an extension implements its MUST-level behaviors and follows its declared fallback.'),
  req('R-29.5-c', '29.5', 'MUST', 'feature', BOTH, 'Extension identifiers follow the naming rules of §6.'),
  req('R-29.5-d', '29.5', 'MUST', 'feature', BOTH, 'When a peer lacks an advertised extension, the supporting party reverts to core behavior or rejects with an appropriate error.'),
  req('R-29.5-e', '29.5', 'OPTIONAL', 'feature', BOTH, 'Features whose status is Deprecated are optional to implement.'),
  req('R-29.5-f', '29.5', 'MUST', 'feature', BOTH, 'A Deprecated feature that is implemented follows its specified behavior in full; partial/divergent implementation is non-conformant.'),

  // §29.6 — Robustness and forward compatibility
  req('R-29.6-a', '29.6', 'MUST', 'feature', BOTH, 'A conformant implementation is tolerant of inputs richer than it understands.'),
  req('R-29.6-b', '29.6', 'MUST', 'feature', BOTH, 'An implementation ignores unrecognized fields in any received object rather than rejecting the message.'),
  req('R-29.6-c', '29.6', 'MUST', 'feature', BOTH, 'An implementation ignores unrecognized advertised capabilities and does not treat them as an error.'),
  req('R-29.6-d', '29.6', 'MUST', 'feature', BOTH, 'An implementation ignores unrecognized extension identifiers in the extensions map (triggering §29.5 fallback).'),
  req('R-29.6-e', '29.6', 'MUST', 'role', CLIENT, 'A client accepts unrecognized error codes as request failures without crashing or misclassifying them.'),
  req('R-29.6-f', '29.6', 'MUST', 'feature', BOTH, 'A resultType value not recognized by the receiver is treated as an error.'),
  req('R-29.6-g', '29.6', 'MUST NOT', 'role', CLIENT, 'A client must not act on a result whose discriminator it cannot interpret.'),
  req('R-29.6-h', '29.6', 'MUST', 'feature', BOTH, 'Where the resultType discriminator is absent, the receiver applies the §3 absence rule.'),
  req('R-29.6-i', '29.6', 'MUST NOT', 'feature', BOTH, 'Ignoring the unrecognized must not silently discard understood, semantically required content.'),

  // §29.7 — Conformance and the stateless model
  req('R-29.7-a', '29.7', 'MUST', 'feature', SERVER, 'A server processes each request independently and must not infer context from any earlier request.'),
  req('R-29.7-b', '29.7', 'MUST', 'feature', BOTH, 'State spanning requests is referenced by an explicit identifier or opaque value the client supplies on each request.'),
  req('R-29.7-c', '29.7', 'MUST NOT', 'feature', BOTH, 'An implementation must not treat the connection/process as the lifetime boundary of a conversation, task, or subscription.'),
  req('R-29.7-d', '29.7', 'MUST', 'feature', SERVER, 'A requestState that passes through a client is treated as attacker-controlled input.'),
  req('R-29.7-e', '29.7', 'MUST', 'feature', SERVER, 'If requestState influences authorization/resource access/business logic, the server protects its integrity and rejects state failing verification.'),

  // §29.8 — Transport conformance
  req('R-29.8-a', '29.8', 'MUST', 'transport', BOTH, 'A conformant implementation implements at least one §7 transport.'),
  req('R-29.8-b', '29.8', 'MUST', 'transport', BOTH, 'Each implemented transport upholds its framing, routing, and error-mapping requirements (stdio §8, Streamable HTTP §9).'),
  req('R-29.8-c', '29.8', 'MUST', 'transport', BOTH, 'On Streamable HTTP, -32602 (malformed/missing field) and -32003 (missing required capability) map to the prescribed HTTP statuses.'),
  req('R-29.8-d', '29.8', 'SHOULD', 'transport', BOTH, 'An HTTP-based transport should conform to §23 Authorization.'),
  req('R-29.8-e', '29.8', 'SHOULD NOT', 'transport', BOTH, 'A stdio transport should not apply the authorization framework; it obtains credentials from its environment.'),
  req('R-29.8-f', '29.8', 'MUST NOT', 'transport', BOTH, 'Conformance of one transport must not be contingent on another; each independently satisfies its own requirements.'),
  req('R-29.8-g', '29.8', 'MAY', 'transport', BOTH, 'Multiple transports may be offered concurrently.'),

  // §29.9 — Determining conformance
  req('R-29.9-a', '29.9', 'MAY', 'feature', BOTH, 'An implementation satisfying every applicable requirement is conformant; no behavior outside this document is required.'),
  req('R-29.9-b', '29.9', 'MUST', 'feature', BOTH, 'An implementation either fully satisfies an advertised feature’s MUST-level behavior or must not advertise it; no partial state.'),
  req('R-29.9-c', '29.9', 'MUST', 'feature', BOTH, 'For features in its profile, an implementation uses the exact codes (App. B), _meta keys (App. C), and capability identifiers (App. D).'),

  // §30 — References
  req('R-30-a', '30', 'MAY', 'feature', BOTH, 'Citation markers are provenance only and never load-bearing; all normative content is in the body.'),
] as const;

/** Index of {@link CONFORMANCE_REQUIREMENTS} by requirement id, for O(1) lookup. */
const REQUIREMENT_BY_ID: ReadonlyMap<string, ConformanceRequirement> = new Map(
  CONFORMANCE_REQUIREMENTS.map((r) => [r.id, r]),
);

/** Looks up a requirement by its id (e.g. `"R-29.2-h"`), or `undefined`. */
export function lookupRequirement(id: string): ConformanceRequirement | undefined {
  return REQUIREMENT_BY_ID.get(id);
}

/** Returns every requirement whose `axis` matches. (§29.1) */
export function requirementsForAxis(axis: ConformanceAxis): ConformanceRequirement[] {
  return CONFORMANCE_REQUIREMENTS.filter((r) => r.axis === axis);
}

/**
 * Returns every requirement that binds `role`. A requirement with an empty
 * `roles` list binds every role; otherwise it binds only the named roles.
 * (§29.1 item 1)
 */
export function requirementsForRole(role: ConformanceRole): ConformanceRequirement[] {
  return CONFORMANCE_REQUIREMENTS.filter((r) => r.roles.length === 0 || r.roles.includes(role));
}

// ─── §6 / Appendix D — Capability → obligation map (§29.4) ───────────────────────

/**
 * One capability-conditioned obligation: advertising `capability` binds the
 * advertising `party` to the MUST-level requirements of `section`. (§29.4 item 1,
 * R-29.4-b – R-29.4-g) The data form of "advertise implies implement".
 */
export interface CapabilityObligation {
  /** The advertised capability identifier (Appendix D / §6). */
  readonly capability: ServerCapabilityName | ClientCapabilityName;
  /** Which party advertises and is thereby bound. */
  readonly party: ConformanceRole;
  /** The spec section whose MUST-level behavior the advertiser must satisfy. */
  readonly section: string;
  /** Any additional sections also bound by this capability (e.g. subscriptions → §10). */
  readonly additionalSections: readonly string[];
}

/**
 * The per-capability obligation map of §29.4: each advertised capability binds
 * its advertiser to a feature section's MUST-level behavior. (R-29.4-b – R-29.4-g)
 *
 *   tools        → §16
 *   resources    → §17  (resources.subscribe additionally → §10)
 *   prompts      → §18
 *   completions  → §19
 *   elicitation  → §20  (client)
 */
export const CAPABILITY_OBLIGATIONS: readonly CapabilityObligation[] = [
  { capability: 'tools', party: 'server', section: '16', additionalSections: [] },
  { capability: 'resources', party: 'server', section: '17', additionalSections: [] },
  { capability: 'resources.subscribe', party: 'server', section: '17', additionalSections: ['10'] },
  { capability: 'prompts', party: 'server', section: '18', additionalSections: [] },
  { capability: 'completions', party: 'server', section: '19', additionalSections: [] },
  { capability: 'elicitation', party: 'client', section: '20', additionalSections: [] },
] as const;

/**
 * Returns the obligation a party incurs by advertising `capability`, or
 * `undefined` when the capability carries no enumerated feature-section
 * obligation beyond the baseline. (§29.4)
 */
export function obligationForCapability(
  capability: string,
): CapabilityObligation | undefined {
  return CAPABILITY_OBLIGATIONS.find((o) => o.capability === capability);
}

/**
 * Returns the spec sections whose MUST-level behavior an implementation is bound
 * to, given the capabilities it advertises. (§29.4 item 1, R-29.4-a – R-29.4-g)
 * The result is deterministic, de-duplicated, and includes the additional
 * sections (e.g. `resources.subscribe` adds `10`).
 */
export function obligedSectionsForCapabilities(advertised: Iterable<string>): string[] {
  const sections = new Set<string>();
  for (const capability of advertised) {
    const obligation = obligationForCapability(capability);
    if (obligation === undefined) continue;
    sections.add(obligation.section);
    for (const extra of obligation.additionalSections) sections.add(extra);
  }
  return [...sections].sort((a, b) => Number(a) - Number(b));
}

// ─── §29.2 — Baseline server request disposition ────────────────────────────────

/**
 * The disposition a conformant server reaches for an incoming request after the
 * ordered §29.2 checks. Either a rejection carrying the registry-exact code, or
 * acceptance (the request proceeds to a resultType-tagged success). (§29.2)
 */
export type ServerRequestDisposition =
  /** §29.2 item 4 failed: unsupported declared revision. (R-29.2-h) */
  | { ok: false; stage: 'revision'; code: typeof UNSUPPORTED_PROTOCOL_VERSION_CODE; data: { supported: string[]; requested: unknown } }
  /** §29.2 item 6 failed: a §4-required envelope field is missing/malformed. (R-29.2-j) */
  | { ok: false; stage: 'envelope'; code: typeof INVALID_PARAMS_CODE; message: string }
  /** §29.2 item 5 failed: a required client capability was not declared. (R-29.2-i, R-29.4-k) */
  | { ok: false; stage: 'capability'; code: typeof MISSING_CLIENT_CAPABILITY_CODE; data: { requiredCapabilities: Record<string, unknown> } }
  /** §29.2 item 8 failed: the feature is not gated by an advertised capability. (R-29.2-m, R-29.2-n) */
  | { ok: false; stage: 'gating'; reason: 'not-advertised' }
  /** All checks pass: the request is accepted and proceeds to a success result. */
  | { ok: true };

/** Inputs to {@link classifyServerRequest}: a single self-contained §4 request and the server's surface. */
export interface ServerRequestContext {
  /** The request's `params._meta` envelope (raw). */
  readonly meta: Record<string, unknown>;
  /** The revisions the server supports (always includes the wire value). */
  readonly serverSupportedRevisions: readonly string[];
  /** The capabilities required to process this request, as a ClientCapabilities-shaped map. */
  readonly requiredClientCapabilities?: Record<string, unknown>;
  /** Whether the requested feature is gated behind a capability the server advertised. */
  readonly featureAdvertised?: boolean;
}

/**
 * Applies the ordered §29.2 baseline-server request checks to ONE self-contained
 * §4 request and returns its {@link ServerRequestDisposition}. (§29.2,
 * R-29.2-e – R-29.2-n, R-29.4-k)
 *
 * The checks run strictly in the §7 flow order — judged on this request's own
 * envelope, NEVER on connection or prior-request state (R-29.1-e, R-29.2-f):
 *   1. revision supported?            → else -32004 (data: supported, requested)
 *   2. all §4-required fields present?  → else -32602 (Invalid params)
 *   3. required client capability declared? → else -32003 (data.requiredCapabilities)
 *   4. feature gated by advertised cap? → else refuse (not advertised)
 *   else → accept (proceeds to a resultType-tagged success).
 *
 * Reuses {@link validateRequestMeta} for the envelope check (so the same
 * required-field set is honored) and {@link computeMissingClientCapabilities}
 * for the capability gate. The revision check uses the declared revision from
 * the envelope against `serverSupportedRevisions` (always including
 * {@link CURRENT_PROTOCOL_VERSION}).
 *
 * Note the ordering rationale: a malformed protocol-version field (not a
 * well-formed-but-unsupported revision) is an envelope failure (-32602), so the
 * revision check first asks whether the declared revision is a well-formed,
 * server-unsupported one; a structurally invalid envelope falls through to the
 * -32602 stage.
 */
export function classifyServerRequest(ctx: ServerRequestContext): ServerRequestDisposition {
  // (1) Unsupported revision — only when the declared version is a well-formed
  //     string the server does not support. A missing/malformed version is an
  //     envelope failure handled by step (2).
  const declaredRevision = ctx.meta[PROTOCOL_VERSION_META_KEY];
  if (
    typeof declaredRevision === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(declaredRevision) &&
    !ctx.serverSupportedRevisions.includes(declaredRevision)
  ) {
    return {
      ok: false,
      stage: 'revision',
      code: UNSUPPORTED_PROTOCOL_VERSION_CODE,
      data: { supported: [...ctx.serverSupportedRevisions], requested: declaredRevision },
    };
  }

  // (2) Malformed envelope — any §4-required field missing/invalid.
  const metaResult = validateRequestMeta(ctx.meta);
  if (!metaResult.ok) {
    return { ok: false, stage: 'envelope', code: INVALID_PARAMS_CODE, message: metaResult.message };
  }

  // (3) Missing required client capability.
  if (ctx.requiredClientCapabilities !== undefined) {
    const declared = ctx.meta[CLIENT_CAPABILITIES_META_KEY];
    const declaredCaps = isObject(declared) ? declared : {};
    const requiredCapabilities = computeMissingClientCapabilities(declaredCaps, ctx.requiredClientCapabilities);
    if (Object.keys(requiredCapabilities).length > 0) {
      return {
        ok: false,
        stage: 'capability',
        code: MISSING_CLIENT_CAPABILITY_CODE,
        data: { requiredCapabilities },
      };
    }
  }

  // (4) Capability gating — refuse any feature not advertised.
  if (ctx.featureAdvertised === false) {
    return { ok: false, stage: 'gating', reason: 'not-advertised' };
  }

  return { ok: true };
}

/**
 * Asserts that a successful result carries a {@link RESULT_TYPE} discriminator
 * drawn from the core set plus the values of advertised extensions only.
 * (§29.2 items 7 & 8, R-29.2-k, R-29.2-l)
 *
 * Returns `{ ok: false, reason }` when the discriminator is absent
 * (`'missing'`) or present but not in the accepted set (`'not-advertised'`).
 * Reuses {@link isResultTypeAccepted} (S38) so the accepted set is exactly the
 * core values plus those contributed by extensions in `activeExtensionSet`.
 *
 * @param result               - The success result object (raw).
 * @param activeExtensionSet    - The extensions active for this interaction.
 * @param extensionResultTypes  - Map of extension id → the resultType values it contributes.
 */
export function validateSuccessResultType(
  result: Record<string, unknown>,
  activeExtensionSet: Iterable<string> = [],
  extensionResultTypes: ReadonlyMap<string, Iterable<string>> = new Map(),
): { ok: true; resultType: string } | { ok: false; reason: 'missing' | 'not-advertised'; resultType?: string } {
  const raw = result['resultType'];
  if (typeof raw !== 'string') {
    return { ok: false, reason: 'missing' };
  }
  if (!isResultTypeAccepted(raw, activeExtensionSet, extensionResultTypes)) {
    return { ok: false, reason: 'not-advertised', resultType: raw };
  }
  return { ok: true, resultType: raw };
}

// ─── §29.3 — Baseline client conformance helpers ────────────────────────────────

/**
 * Validates that a client request's metadata carries the three §4-required
 * fields — protocol revision, client identity, and client capabilities — that
 * baseline client conformance mandates on EVERY request. (§29.3 item 1, R-29.3-a)
 *
 * A thin, intention-revealing wrapper over {@link validateRequestMeta} so the
 * client-side baseline check and the server-side envelope check share one
 * required-field definition (the stateless model forbids relying on a remembered
 * earlier request).
 */
export function clientRequestCarriesBaselineEnvelope(meta: Record<string, unknown>): boolean {
  return validateRequestMeta(meta).ok;
}

/**
 * The fields a client MUST include in every request's per-request metadata.
 * (§29.3 item 1, R-29.3-a) Exposed for a conformance harness to assert presence.
 */
export const REQUIRED_CLIENT_REQUEST_META_KEYS: readonly string[] = [
  PROTOCOL_VERSION_META_KEY,
  CLIENT_INFO_META_KEY,
  CLIENT_CAPABILITIES_META_KEY,
];

/**
 * Validates a client's retry request after an `input_required` result. (§29.3
 * item 4, R-29.3-j) The retry MUST: (a) use a request id distinct from the
 * original, (b) echo `requestState` byte-for-byte when one was provided, and
 * (c) omit `requestState` when none was provided.
 *
 * Returns `{ ok: false, reason }` identifying the first violated rule, else
 * `{ ok: true }`. `requestState` comparison is strict equality (the value is
 * opaque and echoed exactly, R-29.3-f).
 *
 * @param opts.originalId     - The original request's id.
 * @param opts.retryId        - The retry request's id (must differ).
 * @param opts.providedState  - The requestState the server provided, or undefined when none.
 * @param opts.retryState     - The requestState the retry carries, or undefined when absent.
 */
export function validateInputRequiredRetry(opts: {
  originalId: string | number;
  retryId: string | number;
  providedState?: string;
  retryState?: string;
}): { ok: true } | { ok: false; reason: 'reused-id' | 'state-mismatch' | 'unexpected-state' } {
  if (opts.retryId === opts.originalId) {
    return { ok: false, reason: 'reused-id' };
  }
  if (opts.providedState === undefined) {
    // No state was provided → the retry MUST NOT include one.
    if (opts.retryState !== undefined) {
      return { ok: false, reason: 'unexpected-state' };
    }
    return { ok: true };
  }
  // State was provided → the retry MUST echo it exactly.
  if (opts.retryState !== opts.providedState) {
    return { ok: false, reason: 'state-mismatch' };
  }
  return { ok: true };
}

// ─── §29.4 item 5 — No unsolicited input requests ───────────────────────────────

/**
 * The map from an input-request kind to the client capability that authorizes a
 * server to place it into an `input_required` result. (§29.4 item 5, R-29.4-l)
 * A server MUST NOT include an input request of a kind the client has not
 * declared (e.g. no elicitation input request without the elicitation capability).
 */
export const INPUT_REQUEST_REQUIRED_CAPABILITY: Readonly<Record<string, ClientCapabilityName>> = {
  'elicitation/create': 'elicitation',
  'roots/list': 'roots',
  'sampling/createMessage': 'sampling',
};

/**
 * Returns `true` when a server MAY place an input request of `method` into an
 * `input_required` result for a client declaring `clientCapabilities`. (§29.4
 * item 5, R-29.4-l) An unrecognized method is rejected (`false`): a server must
 * not solicit a kind it cannot tie to a declared capability.
 *
 * Delegates to S17's {@link mayEmitInputRequestKind} — the SAME gate the live
 * server now enforces in its solicitation path (`McpServer`'s `InputCollector`,
 * rejecting an undeclared kind with `-32003`). Sharing one implementation keeps
 * the conformance model and the runtime from drifting: this is no longer an
 * unwired shadow-spec, it is the runtime's own gate expressed at the model layer.
 */
export function mayPlaceInputRequest(
  method: string,
  clientCapabilities: Record<string, unknown>,
): boolean {
  return mayEmitInputRequestKind(method, clientCapabilities);
}

// ─── §29.6 — Robustness & forward compatibility ─────────────────────────────────

/**
 * How a conformant receiver disposes of an element of a received message under
 * the §29.6 robustness rules. (§29.6)
 *
 *   - `accept`         — a recognized, understood element: process it normally;
 *   - `ignore`         — an unrecognized field/capability/extension: ignore it,
 *                        do NOT reject the message (R-29.6-b/c/d);
 *   - `treat-as-error` — an unrecognized resultType: the whole response is an
 *                        error and MUST NOT be acted upon (R-29.6-f/g);
 *   - `fail-request`   — an unrecognized error code: a request failure surfaced
 *                        via message/data, never a crash/misclassification (R-29.6-e).
 */
export type RobustnessDisposition = 'accept' | 'ignore' | 'treat-as-error' | 'fail-request';

/** The kind of received element being disposed of under §29.6. */
export type RobustnessElement = 'field' | 'capability' | 'extension' | 'result-type' | 'error-code';

/**
 * Computes the §29.6 robustness disposition for one received element, given
 * whether the receiver recognizes it. (§29.6, R-29.6-a – R-29.6-h)
 *
 *   - an unknown `field`/`capability`/`extension` → `ignore` (never reject);
 *   - an unknown `result-type` → `treat-as-error` (must not act on it);
 *   - an unknown `error-code`  → `fail-request` (surface as a failure);
 *   - any recognized element     → `accept`.
 *
 * This NEVER discards understood content: robustness applies only to the
 * unrecognized (R-29.6-i) — a recognized element always returns `accept`. The
 * absence of a resultType is handled by {@link interpretResultType} (the §3
 * absence rule, R-29.6-h), not here.
 */
export function robustnessDisposition(
  element: RobustnessElement,
  recognized: boolean,
): RobustnessDisposition {
  if (recognized) return 'accept';
  switch (element) {
    case 'field':
    case 'capability':
    case 'extension':
      return 'ignore';
    case 'result-type':
      return 'treat-as-error';
    case 'error-code':
      return 'fail-request';
  }
}

/**
 * Applies the §29.6 + §3 receiver rules to a result's `resultType`. (R-29.6-f,
 * R-29.6-g, R-29.6-h) Returns:
 *   - `{ act: true, resultType }`   — recognized (core or, when supplied, an
 *     accepted extension value): the receiver MAY act on the result;
 *   - `{ act: false, reason: 'unrecognized', resultType }` — present but not
 *     accepted: treat the whole response as an error, do not act (R-29.6-f/g);
 *
 * An ABSENT discriminator is resolved by the §3 absence rule via
 * {@link interpretResultType} (treated as `"complete"`, recognized) so the
 * receiver acts on it (R-29.6-h).
 */
export function decideResultAction(
  result: Record<string, unknown>,
  activeExtensionSet: Iterable<string> = [],
  extensionResultTypes: ReadonlyMap<string, Iterable<string>> = new Map(),
): { act: true; resultType: string } | { act: false; reason: 'unrecognized'; resultType: string } {
  const raw = result['resultType'];
  // §3 absence rule (R-29.6-h): an absent/null discriminator is "complete".
  if (raw === undefined || raw === null) {
    const interpreted = interpretResultType(result);
    return { act: true, resultType: interpreted.resultType };
  }
  const value = String(raw);
  if (isKnownResultType(value) || isResultTypeAccepted(value, activeExtensionSet, extensionResultTypes)) {
    return { act: true, resultType: value };
  }
  return { act: false, reason: 'unrecognized', resultType: value };
}

// ─── §29.7 — Stateless-model conformance invariants ─────────────────────────────

/**
 * The stateless-model invariants that bind every role. (§29.7, R-29.7-a – R-29.7-e)
 * A flat, enumerable restatement a conformance harness can assert against.
 */
export const STATELESS_CONFORMANCE_INVARIANTS = {
  /** Each request is processed independently; no context inferred from an earlier one. (R-29.7-a) */
  independentRequests: true,
  /** Cross-request state rides an explicit client-supplied identifier/opaque value. (R-29.7-b) */
  explicitCrossRequestState: true,
  /** The connection/process is NOT the lifetime boundary of a conversation/task/subscription. (R-29.7-c) */
  connectionIsNotLifetimeBoundary: true,
  /** A requestState passing through a client is attacker-controlled input. (R-29.7-d) */
  requestStateIsUntrusted: true,
  /** A security-significant requestState is integrity-protected; failed verification is rejected. (R-29.7-e) */
  requestStateIntegrityProtected: true,
} as const;

/**
 * Decides how a server must treat a `requestState` value that passed through a
 * client. (§29.7 item 4, R-29.7-d, R-29.7-e) It is ALWAYS attacker-controlled
 * input; when it influences authorization, resource access, or business logic
 * the server MUST verify its integrity and reject what fails.
 *
 * @param securitySignificant - Whether the value influences authz/resource/business logic.
 * @param integrityVerified   - Whether the value's integrity check passed.
 */
export function decideRequestStateHandling(
  securitySignificant: boolean,
  integrityVerified: boolean,
): { trust: 'untrusted'; action: 'accept' | 'reject' } {
  if (securitySignificant && !integrityVerified) {
    return { trust: 'untrusted', action: 'reject' };
  }
  return { trust: 'untrusted', action: 'accept' };
}

// ─── §29.8 — Transport conformance ──────────────────────────────────────────────

/** The Streamable HTTP status a protocol error code maps to on that transport. (§29.8 item 3) */
export const STREAMABLE_HTTP_NEGOTIATION_ERROR_STATUS = 400 as const;

/**
 * Maps a protocol error `code` to the HTTP status it MUST ride on the Streamable
 * HTTP transport for the §29.8 negotiation/envelope conditions. (§29.8 item 3,
 * R-29.8-c) `-32602` (malformed/missing field) and `-32003` (missing required
 * client capability) both map to `400 Bad Request`; any other code returns
 * `undefined` (its mapping is governed by §9 / S34, not this conformance point).
 */
export function streamableHttpStatusForProtocolError(code: number): number | undefined {
  return code === INVALID_PARAMS_CODE || code === MISSING_CLIENT_CAPABILITY_CODE
    ? STREAMABLE_HTTP_NEGOTIATION_ERROR_STATUS
    : undefined;
}

/** The conformance evaluation of a SINGLE transport an implementation offers. (§29.8) */
export interface TransportConformance {
  /** The transport being evaluated. */
  readonly transport: ConformanceTransport;
  /** Whether the authorization framework SHOULD apply (HTTP) — R-29.8-d. */
  readonly authorizationApplies: boolean;
  /** Whether the authorization framework SHOULD NOT apply (stdio) — R-29.8-e. */
  readonly authorizationForbidden: boolean;
  /** How credentials are conveyed for this transport. */
  readonly credentialConveyance: ReturnType<typeof credentialConveyanceFor>;
}

/** Maps a {@link ConformanceTransport} to the S35 {@link TransportFamily}. */
function transportFamilyOf(transport: ConformanceTransport): TransportFamily {
  if (transport === 'stdio') return 'stdio';
  if (transport === 'streamable-http' || transport === 'http') return 'http';
  return 'other';
}

/**
 * Evaluates the authorization-applicability conformance points for a single
 * transport. (§29.8 items 4 & 5, R-29.8-d, R-29.8-e) Reuses S35's
 * {@link authorizationAppliesTo}/{@link authorizationForbiddenFor}/
 * {@link credentialConveyanceFor} so the HTTP-vs-stdio rule has one source of
 * truth: an HTTP-based transport SHOULD conform to authorization; a stdio
 * transport SHOULD NOT apply it and obtains credentials from its environment.
 */
export function evaluateTransportConformance(
  transport: ConformanceTransport,
): TransportConformance {
  const family = transportFamilyOf(transport);
  return {
    transport,
    authorizationApplies: authorizationAppliesTo(family),
    authorizationForbidden: authorizationForbiddenFor(family),
    credentialConveyance: credentialConveyanceFor(family),
  };
}

// ─── §6 / §29.5 — Conformance profile ───────────────────────────────────────────

/**
 * The abstract descriptor that fully describes an implementation's conformance:
 * the tuple of roles, advertised revisions, advertised capabilities, advertised
 * extensions, and implemented transports. (§29.9 item 3, story §6) NOT a wire
 * message — it is used to reason about and report conformance.
 */
export interface ConformanceProfile {
  /** The role(s) the implementation plays; binds it to each role's requirements. (R-29.1-b) */
  roles: readonly ConformanceRole[];
  /** The advertised protocol revisions; MUST include the wire value `2026-07-28`. (R-29.9-c) */
  revisions: readonly string[];
  /** The advertised capability identifiers (Appendix D / §6). */
  capabilities: readonly string[];
  /** The advertised extension identifiers; MAY be empty (zero extensions is conformant). (R-29.5-a) */
  extensions: readonly string[];
  /** The implemented transports; at least one, each independently conformant. (R-29.8-a) */
  transports: readonly ConformanceTransport[];
}

/** A single way a {@link ConformanceProfile} fails to be well-formed. */
export interface ConformanceProfileViolation {
  /** Which profile field the violation concerns. */
  field: 'roles' | 'revisions' | 'capabilities' | 'extensions' | 'transports';
  /** Human-readable description of the violation, citing the requirement. */
  message: string;
}

/** Outcome of {@link validateConformanceProfile}. */
export type ConformanceProfileValidation =
  | { ok: true }
  | { ok: false; violations: ConformanceProfileViolation[] };

/**
 * Validates that a {@link ConformanceProfile} is well-formed against the
 * structural requirements of §29. (§29.5 item 2, §29.8 item 1, §29.9 item 3,
 * R-29.1-b, R-29.5-c, R-29.8-a, R-29.9-c) Accumulates ALL violations:
 *
 *   - `roles`      — at least one, each a recognized role (R-29.1-a/b);
 *   - `revisions`  — non-empty and MUST include `2026-07-28` (R-29.9-c);
 *   - `extensions` — every identifier well-formed per §6 naming (R-29.5-c);
 *     an empty list is fully conformant (R-29.5-a);
 *   - `transports` — at least one transport (R-29.8-a).
 *
 * `capabilities` are not constrained here beyond being a list — an unrecognized
 * capability is tolerated by robustness (R-29.6-c), not a profile error.
 */
export function validateConformanceProfile(profile: ConformanceProfile): ConformanceProfileValidation {
  const violations: ConformanceProfileViolation[] = [];

  if (profile.roles.length === 0) {
    violations.push({ field: 'roles', message: 'A profile must declare at least one role (client/server) (R-29.1-a).' });
  }
  for (const role of profile.roles) {
    if (role !== 'client' && role !== 'server') {
      violations.push({ field: 'roles', message: `Unrecognized role "${String(role)}" (R-29.1-a).` });
    }
  }

  if (profile.revisions.length === 0) {
    violations.push({ field: 'revisions', message: 'A profile must advertise at least one protocol revision (R-29.9-c).' });
  }
  if (!profile.revisions.includes(CURRENT_PROTOCOL_VERSION)) {
    violations.push({
      field: 'revisions',
      message: `Advertised revisions must include the wire value "${CURRENT_PROTOCOL_VERSION}" (R-29.9-c).`,
    });
  }

  for (const extension of profile.extensions) {
    if (!isValidExtensionId(extension)) {
      violations.push({ field: 'extensions', message: `Extension identifier "${extension}" is not well-formed per §6 (R-29.5-c).` });
    }
  }

  if (profile.transports.length === 0) {
    violations.push({ field: 'transports', message: 'A conformant implementation must implement at least one transport (R-29.8-a).' });
  }

  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}

/**
 * Returns `true` when `revision` is supported as a profile revision: it is the
 * current wire value, or any revision the profile advertises. (§29.9 item 3)
 * Reuses {@link isSupportedProtocolVersion} for the baseline wire value.
 */
export function profileSupportsRevision(profile: ConformanceProfile, revision: string): boolean {
  return isSupportedProtocolVersion(revision) || profile.revisions.includes(revision);
}

/**
 * Enumerates every normative requirement that APPLIES to a profile: every
 * baseline requirement for the role(s) it plays, plus every transport
 * requirement (an implementation always implements at least one transport).
 * (§29.1, §29.9 item 1) The result is the exact obligation set a conformance
 * harness must verify for this implementation — no more, no less.
 *
 * Feature-axis requirements that are unconditional (the baseline `§29.1`,
 * `§29.6`, `§29.7`, `§29.9` atoms) always apply; the capability-conditioned
 * `§29.4` atoms apply only when the relevant capability is advertised — callers
 * combine this with {@link obligedSectionsForCapabilities} for the feature-section
 * MUST-level behaviors owned by other stories.
 */
export function requirementsForProfile(profile: ConformanceProfile): ConformanceRequirement[] {
  const roleSet = new Set(profile.roles);
  const advertised = new Set(profile.capabilities);
  return CONFORMANCE_REQUIREMENTS.filter((r) => {
    // Role-axis: applies only when the implementation plays a bound role.
    if (r.roles.length > 0 && !r.roles.some((role) => roleSet.has(role))) {
      return false;
    }
    // §29.4 capability-conditioned feature atoms apply only when advertised.
    if (r.section === '29.4') {
      const obligation = CAPABILITY_OBLIGATIONS.find((o) => requirementGuardsCapability(r.id, o.capability));
      if (obligation !== undefined && !advertised.has(obligation.capability)) {
        return false;
      }
    }
    return true;
  });
}

/** Maps a §29.4 requirement id to the capability it is conditioned on, if any. */
function requirementGuardsCapability(requirementId: string, capability: string): boolean {
  const GUARD: Readonly<Record<string, string>> = {
    'R-29.4-b': 'tools',
    'R-29.4-c': 'resources',
    'R-29.4-d': 'prompts',
    'R-29.4-e': 'completions',
    'R-29.4-f': 'elicitation',
  };
  return GUARD[requirementId] === capability;
}

/**
 * Returns `true` when an implementation satisfying ONLY one role's requirements
 * is conformant for `targetRole`. (§29.1, R-29.1-a, R-29.1-b) A both-roles
 * implementation must satisfy each role; satisfying only the other role's
 * requirements is non-conformant for `targetRole`.
 *
 * @param satisfiedRoles - The roles whose requirements the implementation provably satisfies.
 * @param targetRole     - The role whose conformance is being judged.
 */
export function satisfiesRole(
  satisfiedRoles: Iterable<ConformanceRole>,
  targetRole: ConformanceRole,
): boolean {
  return new Set(satisfiedRoles).has(targetRole);
}

// ─── §29.9 — No partial feature conformance ─────────────────────────────────────

/**
 * Enforces "no partial feature conformance": an implementation either fully
 * satisfies the MUST-level behavior of an advertised feature or MUST NOT
 * advertise it. (§29.9 item 4, R-29.9-b; the §29.4 advertise-implies-implement
 * rule, R-29.4-a, R-29.4-j)
 *
 * Returns `{ ok: false, reason: 'advertised-not-implemented' }` when a feature is
 * advertised but not fully implemented (the non-conformant intermediate state),
 * and `{ ok: true }` otherwise — including when an UNadvertised feature is not
 * implemented (perfectly conformant) and when an advertised feature IS fully
 * implemented.
 *
 * @param advertised      - Whether the feature is advertised.
 * @param fullyImplemented - Whether every MUST-level behavior of the feature is implemented.
 */
export function isFeatureFullyConformant(
  advertised: boolean,
  fullyImplemented: boolean,
): { ok: true } | { ok: false; reason: 'advertised-not-implemented' } {
  if (advertised && !fullyImplemented) {
    return { ok: false, reason: 'advertised-not-implemented' };
  }
  return { ok: true };
}

// ─── §30 — Provenance-only references ───────────────────────────────────────────

/**
 * The status the §30 citation markers carry: provenance only, never
 * load-bearing. (§30, R-30-a) No normative behavior, code, name, or wire format
 * depends on the content of any citation; stripping or altering a marker changes
 * nothing observable.
 */
export const CITATION_STATUS = {
  /** Citations identify external sources; they are never load-bearing. (R-30-a) */
  loadBearing: false,
  /** All normative content is fully specified in the document body. (R-30-a) */
  selfContained: true,
} as const;

/**
 * Returns `false` always: no §30 citation marker is ever load-bearing. (R-30-a)
 * Provided as a predicate so a conformance harness can assert that removing a
 * citation changes no required behavior — the answer is unconditionally "not
 * load-bearing", independent of which marker is named.
 */
export function isCitationLoadBearing(_citationMarker: string): boolean {
  return false;
}
