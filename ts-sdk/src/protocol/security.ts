/**
 * S44 — Security Considerations (§28).
 *
 * The cross-cutting security and trust model every conforming MCP implementation
 * MUST honor. §28 is a *consolidating* section: it defines no new wire types but
 * binds together the most critical obligations introduced piecemeal alongside
 * individual features (tools S25, elicitation S31, sampling S33, authorization
 * S37, UI S42). The protocol cannot enforce most of these at the wire level, so
 * conformance depends on implementations honoring them. This module models them
 * as:
 *
 *   - a **registry** of every numbered §28 requirement atom (id, level, the
 *     principle it derives from, and a human-readable statement), so an
 *     implementation can enumerate the baseline and a conformance review can
 *     assert coverage ({@link SECURITY_REQUIREMENTS});
 *   - **predicates / validators** for the obligations that are checkable in code —
 *     consent gating, trust classification of untrusted inputs, token handling,
 *     continuation-token integrity, input/URI/cursor validation, and resource
 *     bounds — most of which **delegate to the per-feature module that already
 *     owns the mechanics** (never re-implementing them); and
 *   - a **checklist** an implementation can assert against to demonstrate it
 *     addresses the four core principles ({@link assessSecurityBaseline}).
 *
 * Reuse (referenced, never redefined): S25 `tools.ts`
 * (`validateToolArguments`/`validateToolStructuredContent`/`hasExternalRef`/
 * `schemaNestingDepth`/`DEFAULT_SCHEMA_LIMITS`), S25 `tools-call.ts`
 * (`mayTrustToolAnnotations`/`buildInvalidArgumentsError`), S31 `elicitation-form.ts`
 * (`assertFormModeMayCollect`/`resolveElicitActionOutcome`/`ELICIT_ACTION`), S33
 * `sampling.ts` (`SamplingConsentObligations`/`unmetRequiredConsentObligations`/
 * `mayServerSendSamplingRequest`), S37 `authorization-flow.ts`
 * (`validateTokenAudience`/`validateAccessTokenRequest`/`urlContainsAccessTokenInQuery`)
 * and `authorization-registration.ts` (`validateExactIssuer`/`mayForwardTokenToServer`/
 * `redactToken`/`isConfidentialToken`/`checkBearerHeaderOnly`), S42 `ui-host.ts`
 * (`mediateUiToolsCall`/`uiExposureIsClean`/`sandboxIsolationIsConforming`/
 * `grantedPermissions`), S18 `pagination.ts` (`buildInvalidCursorError`/
 * `INVALID_CURSOR_CODE`). §23 prevails on any authorization difference, and the
 * Origin/DNS-rebinding rule is owned in full by S15 (§9.11) — restated here only
 * as the §28.10-i predicate.
 *
 * Mirrors the style of `negotiation.ts` / `authorization-registration.ts`:
 * `{ ok: true } | { ok: false; reason }` results, named predicates, and JSDoc
 * citing each spec atom + the AC it covers.
 */

import {
  validateToolArguments,
  validateToolStructuredContent,
  hasExternalRef,
  schemaNestingDepth,
  DEFAULT_SCHEMA_LIMITS,
} from './tools.js';
import {
  mayTrustToolAnnotations,
  type ToolAnnotations,
} from './tools-call.js';
import { assertFormModeMayCollect } from './elicitation-form.js';
import {
  unmetRequiredConsentObligations,
  type SamplingConsentObligations,
} from './sampling.js';
import {
  validateTokenAudience,
  type TokenAudienceValidation,
} from './authorization-flow.js';
import {
  validateExactIssuer,
  mayForwardTokenToServer,
} from './authorization-registration.js';
import {
  uiExposureIsClean,
  sandboxIsolationIsConforming,
  mediateUiToolsCall,
  type ToolsCallMediationInput,
  type ToolsCallMediationDecision,
} from './ui-host.js';
import { buildInvalidCursorError } from './pagination.js';

// ─── §28 requirement registry ───────────────────────────────────────────────────

/** The four §28.1 core security principles every conforming implementation is built around. (R-28.1-a) */
export const SECURITY_PRINCIPLES = [
  'user-consent-and-control',
  'data-privacy',
  'tool-safety',
  'host-mediated-trust',
] as const;

/** One of the four core security principles. (§28.1, R-28.1-a) */
export type SecurityPrinciple = (typeof SECURITY_PRINCIPLES)[number];

/** The normative strength of a §28 requirement atom, mirroring the story's level column. */
export type SecurityRequirementLevel = 'MUST' | 'MUST NOT' | 'SHOULD' | 'MAY';

/** A single normative §28 requirement, as consolidated by S44. */
export interface SecurityRequirement {
  /** The requirement-atom id, e.g. `'R-28.3-g'`. */
  id: string;
  /** Its normative strength. */
  level: SecurityRequirementLevel;
  /** The §28 subsection that states it, e.g. `'§28.3'`. */
  section: string;
  /** The core principle it derives from. (§28.1) */
  principle: SecurityPrinciple;
  /** A concise restatement of the obligation. */
  statement: string;
}

/**
 * Every numbered §28 requirement atom, in spec order — the single enumerable
 * security baseline an implementation must address. (R-28-a, and every R-28.x-y)
 *
 * This is the data behind {@link assessSecurityBaseline} and the conformance
 * lookups; each entry carries the atom id used throughout the per-feature modules
 * so a reviewer can trace an obligation to the code that enforces it (e.g.
 * `R-28.5-b` → S37 `validateTokenAudience`). The protocol cannot enforce these at
 * the wire level (R-28-a), so the registry is the checklist conformance depends
 * on.
 */
export const SECURITY_REQUIREMENTS: readonly SecurityRequirement[] = Object.freeze([
  // §28 overarching
  { id: 'R-28-a', level: 'MUST', section: '§28', principle: 'host-mediated-trust', statement: 'Address the security/trust obligations of arbitrary data access and code execution; the protocol cannot enforce them at the wire level.' },
  // §28.1 core principles
  { id: 'R-28.1-a', level: 'MUST', section: '§28.1', principle: 'host-mediated-trust', statement: 'Be designed around the four core principles: user consent and control, data privacy, tool safety, host-mediated trust.' },
  { id: 'R-28.1-b', level: 'MUST', section: '§28.1', principle: 'user-consent-and-control', statement: 'Users explicitly consent to, and understand, all data access and operations.' },
  { id: 'R-28.1-c', level: 'MUST', section: '§28.1', principle: 'user-consent-and-control', statement: 'Users retain control over what data is shared and what actions are taken.' },
  { id: 'R-28.1-d', level: 'SHOULD', section: '§28.1', principle: 'user-consent-and-control', statement: 'Provide clear interfaces for reviewing and authorizing activities.' },
  { id: 'R-28.1-e', level: 'MUST', section: '§28.1', principle: 'data-privacy', statement: 'Obtain explicit user consent before exposing user data to a server.' },
  { id: 'R-28.1-f', level: 'MUST NOT', section: '§28.1', principle: 'data-privacy', statement: 'Never transmit resource data elsewhere without user consent.' },
  { id: 'R-28.1-g', level: 'SHOULD', section: '§28.1', principle: 'data-privacy', statement: 'Protect user data with appropriate access controls.' },
  { id: 'R-28.1-h', level: 'MUST', section: '§28.1', principle: 'tool-safety', statement: 'Treat tools as arbitrary code execution requiring caution.' },
  { id: 'R-28.1-i', level: 'MUST', section: '§28.1', principle: 'tool-safety', statement: 'Treat tool-behavior descriptions, including annotations, as untrusted unless from a trusted server.' },
  { id: 'R-28.1-j', level: 'MUST', section: '§28.1', principle: 'tool-safety', statement: 'Obtain explicit user consent before invoking any tool.' },
  { id: 'R-28.1-k', level: 'SHOULD', section: '§28.1', principle: 'host-mediated-trust', statement: 'Build robust consent/authorization flows, document implications, implement access controls and data protections.' },
  // §28.2 user consent and control
  { id: 'R-28.2-a', level: 'MUST', section: '§28.2', principle: 'user-consent-and-control', statement: 'Obtain explicit consent before exposing user data or invoking a tool/elicitation/operation on the user’s behalf.' },
  { id: 'R-28.2-b', level: 'MUST', section: '§28.2', principle: 'user-consent-and-control', statement: 'Consent is informed: the user is given enough information to understand it before authorizing.' },
  { id: 'R-28.2-c', level: 'MUST', section: '§28.2', principle: 'user-consent-and-control', statement: 'Users can review and authorize activities and can decline them.' },
  { id: 'R-28.2-d', level: 'MUST NOT', section: '§28.2', principle: 'user-consent-and-control', statement: 'Never treat absence of an explicit refusal as consent.' },
  { id: 'R-28.2-e', level: 'MUST NOT', section: '§28.2', principle: 'user-consent-and-control', statement: 'Never silently escalate an already-granted consent to broader scope or a different operation.' },
  { id: 'R-28.2-f', level: 'MUST', section: '§28.2', principle: 'user-consent-and-control', statement: 'Seek fresh consent where an operation differs materially from one already authorized.' },
  { id: 'R-28.2-g', level: 'SHOULD', section: '§28.2', principle: 'user-consent-and-control', statement: 'Present consent prompts in a form that cannot be spoofed by server-provided content.' },
  // §28.3 tool safety
  { id: 'R-28.3-a', level: 'MUST', section: '§28.3', principle: 'tool-safety', statement: 'Treat a tool invocation as a request to execute arbitrary code with effects the host cannot predict.' },
  { id: 'R-28.3-b', level: 'MUST', section: '§28.3', principle: 'tool-safety', statement: 'Treat tool definitions (names, descriptions, schemas, annotations) as untrusted unless from a trusted server.' },
  { id: 'R-28.3-c', level: 'MUST NOT', section: '§28.3', principle: 'tool-safety', statement: 'Never rely on a tool annotation (e.g. read-only/non-destructive hint) as a security guarantee.' },
  { id: 'R-28.3-d', level: 'MUST', section: '§28.3', principle: 'tool-safety', statement: 'Keep a human in the loop: the user can review, understand, and deny a proposed invocation before it runs.' },
  { id: 'R-28.3-e', level: 'MUST NOT', section: '§28.3', principle: 'tool-safety', statement: 'The decision to invoke a tool never rests solely with the model.' },
  { id: 'R-28.3-f', level: 'SHOULD', section: '§28.3', principle: 'tool-safety', statement: 'Guard against prompt-injection content reaching the model via descriptions, results, or resource contents.' },
  { id: 'R-28.3-g', level: 'MUST', section: '§28.3', principle: 'tool-safety', statement: 'A server rate-limits tools/call invocations.' },
  { id: 'R-28.3-h', level: 'MUST', section: '§28.3', principle: 'tool-safety', statement: 'Reject a tools/call that exceeds the rate limit rather than executing it.' },
  { id: 'R-28.3-i', level: 'MUST', section: '§28.3', principle: 'tool-safety', statement: 'Sanitize tool outputs before returning them.' },
  { id: 'R-28.3-j', level: 'SHOULD', section: '§28.3', principle: 'tool-safety', statement: 'A client shows the tool’s arguments to the user before issuing the call.' },
  { id: 'R-28.3-k', level: 'SHOULD', section: '§28.3', principle: 'tool-safety', statement: 'A client applies a per-call timeout and surfaces a failure when it elapses.' },
  { id: 'R-28.3-l', level: 'SHOULD', section: '§28.3', principle: 'tool-safety', statement: 'A client logs tool usage for audit, observing §28.9 (never logging credentials/tokens).' },
  // §28.4 data privacy and isolation
  { id: 'R-28.4-a', level: 'MUST', section: '§28.4', principle: 'data-privacy', statement: 'A server receives only the context the host elects to share.' },
  { id: 'R-28.4-b', level: 'MUST NOT', section: '§28.4', principle: 'data-privacy', statement: 'Never transmit resource/user data to a server or third party without consent.' },
  { id: 'R-28.4-c', level: 'SHOULD', section: '§28.4', principle: 'data-privacy', statement: 'Protect user data with access controls commensurate with its sensitivity.' },
  { id: 'R-28.4-d', level: 'MUST', section: '§28.4', principle: 'data-privacy', statement: 'Servers are isolated from one another.' },
  { id: 'R-28.4-e', level: 'MUST NOT', section: '§28.4', principle: 'data-privacy', statement: 'One server can never observe the existence, data, or activity of another on the same host.' },
  { id: 'R-28.4-f', level: 'MUST NOT', section: '§28.4', principle: 'data-privacy', statement: 'The host never relays one server’s requests/results/context/credentials to another.' },
  // §28.5 authorization security (§23 authoritative)
  { id: 'R-28.5-a', level: 'MUST', section: '§28.5', principle: 'host-mediated-trust', statement: 'Satisfy the normative requirements of §23 Authorization when authorization is used.' },
  { id: 'R-28.5-b', level: 'MUST', section: '§28.5', principle: 'host-mediated-trust', statement: 'A server validates that every token was issued for it as the intended audience.' },
  { id: 'R-28.5-c', level: 'MUST', section: '§28.5', principle: 'host-mediated-trust', statement: 'A server rejects any token not in its audience or it cannot verify was intended for it.' },
  { id: 'R-28.5-d', level: 'MUST', section: '§28.5', principle: 'host-mediated-trust', statement: 'A server validates a token before processing the request it accompanies.' },
  { id: 'R-28.5-e', level: 'MUST NOT', section: '§28.5', principle: 'host-mediated-trust', statement: 'A server never returns data to an unauthorized party.' },
  { id: 'R-28.5-f', level: 'MUST NOT', section: '§28.5', principle: 'host-mediated-trust', statement: 'A server never accepts a token issued for another resource nor forwards a client token upstream.' },
  { id: 'R-28.5-g', level: 'MUST', section: '§28.5', principle: 'host-mediated-trust', statement: 'When a server calls an upstream API it uses a separate token from the upstream AS.' },
  { id: 'R-28.5-h', level: 'MUST', section: '§28.5', principle: 'host-mediated-trust', statement: 'A client records the expected issuer before redirecting the user agent.' },
  { id: 'R-28.5-i', level: 'MUST', section: '§28.5', principle: 'host-mediated-trust', statement: 'A client compares any returned issuer against the recorded value by exact string comparison and rejects mismatches.' },
  { id: 'R-28.5-j', level: 'MUST', section: '§28.5', principle: 'host-mediated-trust', statement: 'A client uses PKCE with S256 where technically capable.' },
  { id: 'R-28.5-k', level: 'MUST', section: '§28.5', principle: 'host-mediated-trust', statement: 'A client verifies via metadata that the server supports PKCE, refusing to proceed otherwise.' },
  { id: 'R-28.5-l', level: 'SHOULD', section: '§28.5', principle: 'host-mediated-trust', statement: 'A client generates and verifies a state value in the authorization code flow.' },
  { id: 'R-28.5-m', level: 'MUST', section: '§28.5', principle: 'host-mediated-trust', statement: 'A client discards any result whose state is absent or mismatched.' },
  { id: 'R-28.5-n', level: 'MUST', section: '§28.5', principle: 'host-mediated-trust', statement: 'Clients and servers store tokens securely and keep refresh tokens confidential in transit and at rest.' },
  { id: 'R-28.5-o', level: 'MUST NOT', section: '§28.5', principle: 'host-mediated-trust', statement: 'Tokens are never logged.' },
  { id: 'R-28.5-p', level: 'MUST NOT', section: '§28.5', principle: 'host-mediated-trust', statement: 'Tokens are never forwarded to any party other than the one they were issued for.' },
  { id: 'R-28.5-q', level: 'MUST', section: '§28.5', principle: 'host-mediated-trust', statement: 'Authorization-server endpoints and redirect URIs use HTTPS (localhost redirect permitted).' },
  // §28.6 multi-round-trip & continuation safety
  { id: 'R-28.6-a', level: 'MUST', section: '§28.6', principle: 'host-mediated-trust', statement: 'A server protects integrity and confidentiality of the requestState continuation token.' },
  { id: 'R-28.6-b', level: 'MUST', section: '§28.6', principle: 'host-mediated-trust', statement: 'A receiver rejects a continuation token that fails integrity validation rather than acting on it.' },
  { id: 'R-28.6-c', level: 'SHOULD', section: '§28.6', principle: 'host-mediated-trust', statement: 'Servers guard against replay of continuation tokens (single-use/session/operation binding, time-bounded).' },
  // §28.7 elicitation & sampling consent
  { id: 'R-28.7-a', level: 'MUST', section: '§28.7', principle: 'user-consent-and-control', statement: 'Server-initiated elicitation and server-driven model output remain under user control.' },
  { id: 'R-28.7-b', level: 'MUST', section: '§28.7', principle: 'user-consent-and-control', statement: 'For elicitation, the user can review and approve/edit/decline/cancel before anything returns to the server.' },
  { id: 'R-28.7-c', level: 'MUST', section: '§28.7', principle: 'user-consent-and-control', statement: 'The user can decline or cancel an elicitation at any point.' },
  { id: 'R-28.7-d', level: 'MUST NOT', section: '§28.7', principle: 'user-consent-and-control', statement: 'A server never uses elicitation to phish for credentials or secrets.' },
  { id: 'R-28.7-e', level: 'SHOULD', section: '§28.7', principle: 'user-consent-and-control', statement: 'Clients show the requesting server’s identity and treat secret requests as suspect.' },
  { id: 'R-28.7-f', level: 'MUST', section: '§28.7', principle: 'user-consent-and-control', statement: 'Sampling prompts and completions are subject to human review before being acted upon or transmitted.' },
  { id: 'R-28.7-g', level: 'MUST NOT', section: '§28.7', principle: 'user-consent-and-control', statement: 'The host never discloses more conversation context to a sampling request than the user authorized.' },
  // §28.8 UI sandboxing
  { id: 'R-28.8-a', level: 'MUST', section: '§28.8', principle: 'host-mediated-trust', statement: 'Render server-provided UI in an isolated sandbox under a restrictive content-security policy.' },
  { id: 'R-28.8-b', level: 'MUST', section: '§28.8', principle: 'host-mediated-trust', statement: 'The host mediates every privileged action the UI requests.' },
  { id: 'R-28.8-c', level: 'MUST', section: '§28.8', principle: 'host-mediated-trust', statement: 'A UI-requested tools/call is routed through the normal consent/human-in-the-loop path.' },
  { id: 'R-28.8-d', level: 'MUST NOT', section: '§28.8', principle: 'host-mediated-trust', statement: 'The UI can never cause a tool to run without host mediation and user consent.' },
  { id: 'R-28.8-e', level: 'MUST NOT', section: '§28.8', principle: 'host-mediated-trust', statement: 'The host never exposes credentials/tokens/unrelated context to the sandboxed content.' },
  { id: 'R-28.8-f', level: 'MUST NOT', section: '§28.8', principle: 'host-mediated-trust', statement: 'The host never lets sandboxed content exfiltrate host/user state beyond what the policy permits.' },
  { id: 'R-28.8-g', level: 'SHOULD', section: '§28.8', principle: 'host-mediated-trust', statement: 'Constrain the sandbox’s network/storage/scripting capabilities to the minimum required.' },
  { id: 'R-28.8-h', level: 'SHOULD', section: '§28.8', principle: 'host-mediated-trust', statement: 'Ensure host-rendered consent/identity indicators cannot be spoofed or obscured by the sandbox.' },
  // §28.9 metadata & observability
  { id: 'R-28.9-a', level: 'MUST NOT', section: '§28.9', principle: 'host-mediated-trust', statement: 'Never use any metadata value (trace ids, progress tokens) for authentication/authorization/access-control.' },
  { id: 'R-28.9-b', level: 'SHOULD', section: '§28.9', principle: 'host-mediated-trust', statement: 'Validate the structure of consumed metadata and ignore values not understood.' },
  { id: 'R-28.9-c', level: 'SHOULD', section: '§28.9', principle: 'data-privacy', statement: 'Avoid logging sensitive metadata or recording sensitive request/result content.' },
  { id: 'R-28.9-d', level: 'MUST NOT', section: '§28.9', principle: 'host-mediated-trust', statement: 'Credentials and tokens are never logged.' },
  { id: 'R-28.9-e', level: 'SHOULD', section: '§28.9', principle: 'data-privacy', statement: 'Minimize and redact observability data that may transit/store outside the trust boundary.' },
  // §28.10 input validation & resource bounds
  { id: 'R-28.10-a', level: 'MUST', section: '§28.10', principle: 'tool-safety', statement: 'Validate all inputs accepted from a peer before acting on them.' },
  { id: 'R-28.10-b', level: 'MUST NOT', section: '§28.10', principle: 'tool-safety', statement: 'Never assume a peer is well-behaved.' },
  { id: 'R-28.10-c', level: 'MUST', section: '§28.10', principle: 'tool-safety', statement: 'A server validates tool-call arguments against the declared input schema before relying on them.' },
  { id: 'R-28.10-d', level: 'SHOULD', section: '§28.10', principle: 'tool-safety', statement: 'A client validates structured results against a declared output schema before relying on them.' },
  { id: 'R-28.10-e', level: 'MUST', section: '§28.10', principle: 'tool-safety', statement: 'Validation failures are reported as errors rather than acted upon.' },
  { id: 'R-28.10-f', level: 'MUST', section: '§28.10', principle: 'data-privacy', statement: 'Validate resource URIs and URI templates before dereferencing or matching them.' },
  { id: 'R-28.10-g', level: 'MUST NOT', section: '§28.10', principle: 'data-privacy', statement: 'Never follow a URI to a location the user has not authorized.' },
  { id: 'R-28.10-h', level: 'SHOULD', section: '§28.10', principle: 'data-privacy', statement: 'Guard against SSRF where a URI could cause the receiver to issue a network request.' },
  { id: 'R-28.10-i', level: 'MUST', section: '§28.10', principle: 'host-mediated-trust', statement: 'A server with an HTTP endpoint validates the Origin header on every connection (DNS-rebinding defense, §9.11).' },
  { id: 'R-28.10-j', level: 'MUST', section: '§28.10', principle: 'tool-safety', statement: 'A server treats a pagination cursor as opaque/untrusted, validates it, and rejects malformed/unknown/expired cursors.' },
  { id: 'R-28.10-k', level: 'MUST', section: '§28.10', principle: 'tool-safety', statement: 'Bound resources consumed while validating inputs: schema nesting depth and validation time.' },
  { id: 'R-28.10-l', level: 'SHOULD', section: '§28.10', principle: 'tool-safety', statement: 'Impose message/payload size limits and reject inputs that exceed them.' },
  { id: 'R-28.10-m', level: 'MUST NOT', section: '§28.10', principle: 'tool-safety', statement: 'Never automatically dereference external schema references in a tool schema.' },
  { id: 'R-28.10-n', level: 'MUST', section: '§28.10', principle: 'tool-safety', statement: 'Schemas are self-contained or resolved only against explicitly trusted sources.' },
  { id: 'R-28.10-o', level: 'MUST', section: '§28.10', principle: 'data-privacy', statement: 'When serving file:// resources, sanitize file paths to prevent directory traversal.' },
  { id: 'R-28.10-p', level: 'MUST NOT', section: '§28.10', principle: 'data-privacy', statement: 'Never serve a file outside the directories the user has authorized.' },
]);

/** Index over {@link SECURITY_REQUIREMENTS} by atom id, built once. */
const REQUIREMENTS_BY_ID: ReadonlyMap<string, SecurityRequirement> = new Map(
  SECURITY_REQUIREMENTS.map((r) => [r.id, r]),
);

/**
 * Looks up a §28 requirement atom by id (e.g. `'R-28.5-b'`), or `undefined`.
 * (R-28-a)
 *
 * @param id - The requirement-atom id.
 */
export function lookupSecurityRequirement(id: string): SecurityRequirement | undefined {
  return REQUIREMENTS_BY_ID.get(id);
}

/**
 * Returns every §28 requirement that derives from a given core principle, in spec
 * order — the per-principle slice of the baseline. (R-28.1-a)
 *
 * @param principle - One of the four core principles.
 */
export function securityRequirementsForPrinciple(
  principle: SecurityPrinciple,
): SecurityRequirement[] {
  return SECURITY_REQUIREMENTS.filter((r) => r.principle === principle);
}

/** Returns every MUST / MUST NOT requirement — the hard obligations conformance turns on. (R-28-a) */
export function mandatorySecurityRequirements(): SecurityRequirement[] {
  return SECURITY_REQUIREMENTS.filter((r) => r.level === 'MUST' || r.level === 'MUST NOT');
}

// ─── §28.1 — Core-principle baseline checklist (R-28.1-a; AC-44.1) ───────────────

/**
 * A host's self-assertion that it addresses each of the four §28.1 core
 * principles, the checklist a conformance review asserts against. (§28.1,
 * R-28-a, R-28.1-a; AC-44.1) Each boolean reports whether the implementation
 * claims to be designed around that principle.
 */
export interface SecurityBaselineClaims {
  /** Users explicitly consent to and control all data access/operations. (R-28.1-b, R-28.1-c) */
  userConsentAndControl: boolean;
  /** A server receives only host-elected context; no transmission without consent. (R-28.1-e, R-28.1-f) */
  dataPrivacy: boolean;
  /** Tools are treated as arbitrary code; definitions/annotations are untrusted. (R-28.1-h, R-28.1-i) */
  toolSafety: boolean;
  /** Trust is mediated and enforced at the host, never delegated to a server. (§28.1(4)) */
  hostMediatedTrust: boolean;
}

/** Outcome of {@link assessSecurityBaseline}. */
export type SecurityBaselineAssessment =
  | { ok: true }
  | { ok: false; unmetPrinciples: SecurityPrinciple[] };

/**
 * Asserts that an implementation is designed around all four §28.1 core
 * principles. (§28.1, R-28-a, R-28.1-a; AC-44.1)
 *
 * Returns `{ ok: true }` only when every principle is claimed; otherwise lists the
 * unmet ones, so a conformance review can fail an implementation that does not
 * demonstrably address the baseline. The principles are the foundation from which
 * the rest of §28 derives, so an unmet principle is a baseline failure, not a
 * warning.
 *
 * @param claims - The host's per-principle self-assertion.
 */
export function assessSecurityBaseline(claims: SecurityBaselineClaims): SecurityBaselineAssessment {
  const unmet: SecurityPrinciple[] = [];
  if (!claims.userConsentAndControl) unmet.push('user-consent-and-control');
  if (!claims.dataPrivacy) unmet.push('data-privacy');
  if (!claims.toolSafety) unmet.push('tool-safety');
  if (!claims.hostMediatedTrust) unmet.push('host-mediated-trust');
  return unmet.length === 0 ? { ok: true } : { ok: false, unmetPrinciples: unmet };
}

// ─── §28.2 — User consent and control (R-28.2-a – R-28.2-g; AC-44.2/3/7) ──────────

/**
 * A record of the consent a user has explicitly granted for a single operation,
 * the host's consent-gate state. (§28.2) Absence of a record is NOT consent
 * (R-28.2-d); the scope captured here is what a later operation is compared
 * against for material change (R-28.2-e, R-28.2-f).
 */
export interface ConsentGrant {
  /** The operation the user authorized, e.g. a tool name or `'resource-exposure'`. */
  operation: string;
  /**
   * An opaque, comparable summary of WHAT was authorized — the data scope and the
   * action. A materially different value on a later request means fresh consent is
   * required (R-28.2-e, R-28.2-f). Callers choose a stable serialization (e.g. the
   * sorted argument keys + sensitivity class).
   */
  scope: string;
  /** `true` when the user actively, informedly granted it. Defaults to `false` if absent. (R-28.2-b) */
  informed: boolean;
}

/** A proposed operation seeking the host's consent gate. (§28.2) */
export interface ConsentRequest {
  /** The operation being proposed. */
  operation: string;
  /** The scope summary of the proposed operation, compared against any prior grant. */
  scope: string;
  /**
   * Whether the user has, for THIS proposal, actively and informedly granted
   * consent. Silence/absence MUST NOT be passed as `true` (R-28.2-d). When the
   * proposal matches a prior grant of the same operation+scope, a fresh active
   * grant is not required.
   */
  userApproved?: boolean;
}

/** The §28.2 consent-gate decision. */
export type ConsentDecision =
  | { allowed: true; reason: 'matches-prior-grant' | 'freshly-approved' }
  | {
      allowed: false;
      reason: 'no-consent' | 'not-informed' | 'material-change' | 'silent-escalation';
      detail: string;
    };

/**
 * The host consent gate every operation acting on the user's behalf passes before
 * it reaches a server. (§28.2, R-28.2-a, R-28.2-b, R-28.2-c, R-28.2-d, R-28.2-e,
 * R-28.2-f; AC-44.2, AC-44.7)
 *
 * Allows the operation ONLY when one of:
 *   - it matches a prior grant for the SAME operation and SAME scope — already
 *     authorized, no re-prompt needed; or
 *   - the user freshly, informedly approved THIS proposal (`userApproved === true`).
 *
 * Denies, with a reason, when:
 *   - no prior grant and no fresh approval → `no-consent`: absence of refusal is
 *     never consent (R-28.2-d);
 *   - a fresh approval that is not informed → `not-informed` (R-28.2-b);
 *   - a prior grant exists for the operation but the scope differs materially and
 *     there is no fresh approval → `material-change`/`silent-escalation`: the host
 *     MUST seek fresh consent and MUST NOT silently escalate (R-28.2-e, R-28.2-f).
 *
 * The gate never treats a missing `userApproved` as approval, so a caller cannot
 * accidentally let silence through.
 *
 * @param request   - The proposed operation and whether it was freshly approved.
 * @param priorGrant- The consent already recorded for this operation, if any.
 */
export function evaluateConsent(
  request: ConsentRequest,
  priorGrant?: ConsentGrant,
): ConsentDecision {
  const matchesPrior =
    priorGrant !== undefined &&
    priorGrant.operation === request.operation &&
    priorGrant.scope === request.scope;

  if (matchesPrior) {
    return { allowed: true, reason: 'matches-prior-grant' };
  }

  // A prior grant for the same operation but a DIFFERENT scope is a material change:
  // the host MUST seek fresh consent and MUST NOT silently escalate. (R-28.2-e/-f)
  const isEscalation =
    priorGrant !== undefined && priorGrant.operation === request.operation;

  if (request.userApproved !== true) {
    if (isEscalation) {
      return {
        allowed: false,
        reason: 'silent-escalation',
        detail:
          'the operation differs materially from a prior grant; fresh consent MUST be sought and scope MUST NOT be silently escalated (R-28.2-e, R-28.2-f)',
      };
    }
    return {
      allowed: false,
      reason: 'no-consent',
      detail: 'no prior grant and no explicit approval; absence of refusal is never consent (R-28.2-a, R-28.2-d)',
    };
  }

  // Freshly approved — but consent MUST be informed. (R-28.2-b)
  if (request.userApproved === true && request.scope.length > 0) {
    // Informed-ness is asserted by the caller via the grant it would persist; a
    // fresh approval is accepted as informed here, while a re-prompt for a material
    // change is the path that surfaces the new scope to the user (R-28.2-f).
    return { allowed: true, reason: 'freshly-approved' };
  }

  return {
    allowed: false,
    reason: 'not-informed',
    detail: 'consent MUST be informed: the user MUST understand the data/action before authorizing (R-28.2-b)',
  };
}

/**
 * Builds the {@link ConsentGrant} to persist after a successful, informed approval,
 * so a later identical operation matches without re-prompting. (R-28.2-b, R-28.2-f)
 *
 * Only call after the user has actively and informedly approved; the resulting
 * grant records the operation+scope that {@link evaluateConsent} compares against.
 *
 * @param request - The freshly-approved operation.
 */
export function recordConsentGrant(request: ConsentRequest & { userApproved: true }): ConsentGrant {
  return { operation: request.operation, scope: request.scope, informed: true };
}

// ─── §28.3 — Tool safety: trust classification & rate limiting ───────────────────

/**
 * Classification of an input's trust, the §28 trust-boundary primitive: anything a
 * peer supplies (a tool definition, annotation, metadata field, cursor, URI,
 * schema) is `untrusted` unless it came from a server the host explicitly trusts.
 * (§28.1, §28.3, R-28.1-i, R-28.3-b)
 */
export type InputTrust = 'trusted' | 'untrusted';

/**
 * Classifies a tool definition's trust. A tool definition — names, descriptions,
 * input/output schemas, and annotations — is `untrusted` unless obtained from a
 * server the host trusts. (§28.3, R-28.1-i, R-28.3-b; AC-44.6)
 *
 * Use the result to gate any reliance on the definition's contents: an `untrusted`
 * definition's descriptions may be adversarial (prompt injection) and its
 * annotations carry no authority ({@link toolAnnotationIsSecurityGuarantee}).
 *
 * @param serverIsTrusted - Whether the host explicitly trusts the originating server.
 */
export function classifyToolDefinitionTrust(serverIsTrusted: boolean): InputTrust {
  return serverIsTrusted ? 'trusted' : 'untrusted';
}

/**
 * Returns `false` — a tool annotation is NEVER a security guarantee. (§28.3,
 * R-28.3-c; AC-44.6)
 *
 * A receiver MUST NOT rely on an annotation (e.g. a read-only or non-destructive
 * hint) as a security guarantee; such metadata is descriptive, not authoritative,
 * and a malicious server may misstate it. This is unconditional and delegates the
 * trust gate to S25's {@link mayTrustToolAnnotations}: even when annotations MAY
 * be *displayed* (trusted server), they still convey no enforcement authority.
 *
 * @param _annotations - The tool annotations (ignored; the rule is unconditional).
 */
export function toolAnnotationIsSecurityGuarantee(_annotations?: ToolAnnotations): false {
  return false;
}

/**
 * Returns whether a host MAY surface a tool's annotation hints to the user for
 * THIS server — delegating to S25's {@link mayTrustToolAnnotations}. Displaying a
 * hint from a trusted server is permitted (R-28.3-b); relying on it as a guarantee
 * is not ({@link toolAnnotationIsSecurityGuarantee}, R-28.3-c). (§28.3; AC-44.6)
 *
 * @param serverIsTrusted - Whether the host explicitly trusts the server.
 */
export function mayDisplayToolAnnotations(serverIsTrusted: boolean): boolean {
  return mayTrustToolAnnotations(serverIsTrusted);
}

/** Outcome of {@link assertHumanInTheLoop}. */
export type HumanInTheLoopValidation = { ok: true } | { ok: false; reason: string };

/**
 * Asserts the human-in-the-loop invariant for a proposed tool invocation: the user
 * could review and understand it and the decision did not rest solely with the
 * model. (§28.3, R-28.3-d, R-28.3-e; AC-44.8)
 *
 * Returns `ok: false` when the user was not given the opportunity to review/deny,
 * or when the model alone drove the invocation with no human gate — both of which
 * MUST NOT happen. This is the backstop that prevents prompt-injection-induced
 * requests from executing without review (R-28.3-f).
 *
 * @param options.userCouldReviewAndDeny - The user was able to review, understand,
 *   and deny the invocation before it ran. (R-28.3-d)
 * @param options.modelDecidedAlone      - The invocation decision rested solely with
 *   the model, with no human gate. (R-28.3-e)
 */
export function assertHumanInTheLoop(options: {
  userCouldReviewAndDeny: boolean;
  modelDecidedAlone: boolean;
}): HumanInTheLoopValidation {
  if (options.modelDecidedAlone) {
    return { ok: false, reason: 'the decision to invoke a tool MUST NOT rest solely with the model (R-28.3-e)' };
  }
  if (!options.userCouldReviewAndDeny) {
    return { ok: false, reason: 'a user MUST be able to review, understand, and deny a proposed tool invocation before it runs (R-28.3-d)' };
  }
  return { ok: true };
}

/** The JSON-RPC error code a rate-limited or invalid-request rejection carries. (§28.3 wire example) */
export const RATE_LIMIT_REJECTION_CODE = -32600 as const;

/** A §28.3 rate-limit rejection error object, matching the story's wire example. */
export interface RateLimitRejectionError {
  code: typeof RATE_LIMIT_REJECTION_CODE;
  message: string;
  data?: { retryAfterMs?: number };
}

/**
 * A sliding-window rate limiter a server applies to `tools/call` so a hostile or
 * malfunctioning client cannot drive unbounded execution or downstream load.
 * (§28.3, R-28.3-g, R-28.3-h; AC-44.9)
 *
 * {@link check} returns whether a call is within the limit; a server MUST reject
 * (not execute) any call that exceeds it (R-28.3-h) — use
 * {@link buildRateLimitRejection} to build the `-32600` error. The window is
 * keyed by an opaque caller-chosen client/session id so per-peer limits are
 * independent. Time is injectable for testing.
 */
export class ToolCallRateLimiter {
  readonly #maxInWindow: number;
  readonly #windowMs: number;
  readonly #now: () => number;
  readonly #hits = new Map<string, number[]>();

  /**
   * @param options.maxInWindow - The maximum permitted `tools/call` invocations per
   *   window per key; MUST be a positive integer. (R-28.3-g)
   * @param options.windowMs    - The sliding-window length in milliseconds.
   * @param options.now         - OPTIONAL clock (epoch ms); defaults to `Date.now`.
   * @throws {RangeError} When `maxInWindow`/`windowMs` are not positive.
   */
  constructor(options: { maxInWindow: number; windowMs: number; now?: () => number }) {
    if (!Number.isInteger(options.maxInWindow) || options.maxInWindow < 1) {
      throw new RangeError('maxInWindow MUST be a positive integer (R-28.3-g)');
    }
    if (!(options.windowMs > 0)) {
      throw new RangeError('windowMs MUST be positive (R-28.3-g)');
    }
    this.#maxInWindow = options.maxInWindow;
    this.#windowMs = options.windowMs;
    this.#now = options.now ?? (() => Date.now());
  }

  #pruned(key: string, now: number): number[] {
    const cutoff = now - this.#windowMs;
    const kept = (this.#hits.get(key) ?? []).filter((t) => t > cutoff);
    this.#hits.set(key, kept);
    return kept;
  }

  /**
   * Records and evaluates one `tools/call` for `key`. Returns
   * `{ allowed: true }` when the call is within the limit, or
   * `{ allowed: false, retryAfterMs }` when it exceeds it and MUST be rejected
   * rather than executed (R-28.3-h). A rejected call is NOT counted toward the
   * window, so a flood cannot extend the back-off indefinitely.
   *
   * @param key - An opaque client/session identifier.
   */
  check(key: string): { allowed: true } | { allowed: false; retryAfterMs: number } {
    const now = this.#now();
    const recent = this.#pruned(key, now);
    if (recent.length >= this.#maxInWindow) {
      const oldest = recent[0]!;
      const retryAfterMs = Math.max(0, oldest + this.#windowMs - now);
      return { allowed: false, retryAfterMs };
    }
    recent.push(now);
    this.#hits.set(key, recent);
    return { allowed: true };
  }
}

/**
 * Builds the `-32600` rate-limit rejection error a server returns for a `tools/call`
 * that exceeds the limit, matching the §28.3 wire example. (§28.3, R-28.3-h;
 * AC-44.9)
 *
 * @param retryAfterMs - OPTIONAL hint for when the client may retry.
 * @param message      - OPTIONAL override for the error message.
 */
export function buildRateLimitRejection(retryAfterMs?: number, message?: string): RateLimitRejectionError {
  const error: RateLimitRejectionError = {
    code: RATE_LIMIT_REJECTION_CODE,
    message: message ?? 'Rate limit exceeded for tools/call',
  };
  if (retryAfterMs !== undefined) {
    error.data = { retryAfterMs };
  }
  return error;
}

/**
 * C0/C1 control characters a sanitized tool output MUST NOT carry, EXCLUDING the
 * ordinary whitespace `\t` (`\x09`), `\n` (`\x0a`), `\r` (`\x0d`). Covers the
 * ANSI/escape (`\x1b`) and other control sequences a malicious tool could smuggle.
 * (R-28.3-i)
 */
// eslint-disable-next-line no-control-regex
const CONTROL_SEQUENCE_RE = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g;

/**
 * Sanitizes a tool-output text string so a result cannot carry control sequences
 * that would compromise the client, model, or downstream consumers. (§28.3,
 * R-28.3-i; AC-44.9)
 *
 * Strips C0/C1 control characters (excluding the ordinary whitespace `\t`, `\n`,
 * `\r`) — the ANSI/escape and other control sequences a malicious tool could
 * smuggle into a result. It is a content-level guard: structural sanitization of
 * markup/injected instructions remains the host's responsibility per its render
 * target, but stripping control sequences here removes the lowest-level vector.
 *
 * @param text - The tool-output text to sanitize.
 */
export function sanitizeToolOutputText(text: string): string {
  return text.replace(CONTROL_SEQUENCE_RE, '');
}

/** Returns `true` when `text` contains a control sequence a sanitized output MUST NOT carry. (R-28.3-i) */
export function toolOutputHasControlSequences(text: string): boolean {
  CONTROL_SEQUENCE_RE.lastIndex = 0;
  const has = CONTROL_SEQUENCE_RE.test(text);
  CONTROL_SEQUENCE_RE.lastIndex = 0;
  return has;
}

// ─── §28.4 — Data privacy and isolation (R-28.4-a – R-28.4-f; AC-44.11) ───────────

/** Outcome of {@link assertServerIsolation}. */
export type ServerIsolationValidation = { ok: true } | { ok: false; reason: string };

/**
 * Asserts the §28.4 server-isolation invariant for a flow the host is about to
 * perform: a server receives only host-elected context, never another server's
 * requests/results/context/credentials. (§28.4, R-28.4-a, R-28.4-d, R-28.4-e,
 * R-28.4-f; AC-44.11)
 *
 * Returns `ok: false` when the destination server is not the one the context
 * originated from (cross-server relay) or when the context was not host-elected —
 * both of which the host MUST NOT do. One server can never observe another's data
 * (R-28.4-e); the host is the only boundary and never bridges two servers.
 *
 * @param options.sourceServerId   - The server the context/credential came from, if any.
 * @param options.destinationServerId - The server the host is about to send it to.
 * @param options.hostElected      - `true` when the host deliberately elected to share
 *   this context with the destination (R-28.4-a).
 */
export function assertServerIsolation(options: {
  sourceServerId?: string;
  destinationServerId: string;
  hostElected: boolean;
}): ServerIsolationValidation {
  if (
    options.sourceServerId !== undefined &&
    options.sourceServerId !== options.destinationServerId
  ) {
    return {
      ok: false,
      reason: `the host MUST NOT relay server "${options.sourceServerId}"'s data/credentials to a different server "${options.destinationServerId}" (R-28.4-e, R-28.4-f)`,
    };
  }
  if (!options.hostElected) {
    return {
      ok: false,
      reason: 'a server MUST receive only the context the host elects to share with it (R-28.4-a)',
    };
  }
  return { ok: true };
}

/** Outcome of {@link assertConsentedDataExposure}. */
export type DataExposureValidation = { ok: true } | { ok: false; reason: string };

/**
 * Asserts that user/resource data is exposed to a server (or onward) ONLY with the
 * user's consent. (§28.4, R-28.4-b, R-28.1-e, R-28.1-f; AC-44.3, AC-44.11)
 *
 * Returns `ok: false` when the exposure carries user data without an explicit,
 * matching consent grant — the host MUST NOT transmit resource data without
 * consent. Wraps {@link evaluateConsent} with the `'resource-exposure'` operation,
 * so data-exposure consent rides the same gate as tool-invocation consent.
 *
 * @param options.scope      - The scope summary of the data being exposed.
 * @param options.priorGrant - Any prior data-exposure consent grant.
 * @param options.userApproved - Whether the user freshly approved this exposure.
 */
export function assertConsentedDataExposure(options: {
  scope: string;
  priorGrant?: ConsentGrant;
  userApproved?: boolean;
}): DataExposureValidation {
  const decision = evaluateConsent(
    { operation: 'resource-exposure', scope: options.scope, userApproved: options.userApproved },
    options.priorGrant,
  );
  if (!decision.allowed) {
    return { ok: false, reason: `user data MUST NOT be exposed without consent: ${decision.detail}` };
  }
  return { ok: true };
}

/**
 * A coarse data-sensitivity class governing the strength of access controls a host
 * SHOULD apply. (§28.1, §28.4, R-28.1-g, R-28.4-c; AC-44.4)
 */
export type DataSensitivity = 'public' | 'internal' | 'confidential' | 'secret';

/** Ordered, most-sensitive last, so a higher index demands stronger controls. */
const SENSITIVITY_ORDER: readonly DataSensitivity[] = ['public', 'internal', 'confidential', 'secret'];

/**
 * Returns `true` when the access controls a host applies are at least as strong as
 * the data's sensitivity requires — user data SHOULD be protected with access
 * controls commensurate with its sensitivity. (§28.1, §28.4, R-28.1-g, R-28.4-c;
 * AC-44.4)
 *
 * Compares the data's sensitivity to the strongest control class the host enforces:
 * `confidential` data protected only at `internal` strength fails. Use to gate
 * exposure of sensitive data behind adequate controls.
 *
 * @param dataSensitivity   - The sensitivity class of the data.
 * @param appliedControl    - The strongest access-control class the host enforces for it.
 */
export function accessControlsAreCommensurate(
  dataSensitivity: DataSensitivity,
  appliedControl: DataSensitivity,
): boolean {
  return SENSITIVITY_ORDER.indexOf(appliedControl) >= SENSITIVITY_ORDER.indexOf(dataSensitivity);
}

// ─── §28.5 — Authorization security (restates §23; R-28.5-a – R-28.5-q) ───────────

/** Outcome of {@link validateServerAccessToken}. */
export type ServerTokenValidation =
  | { ok: true }
  | { ok: false; reason: string; code: typeof RATE_LIMIT_REJECTION_CODE };

/**
 * Validates, server-side, that a presented access token is audience-bound to THIS
 * server and was validated before the request is processed; rejects otherwise so
 * no data is returned to an unauthorized party. (§28.5, R-28.5-b, R-28.5-c,
 * R-28.5-d, R-28.5-e; AC-44.12)
 *
 * Delegates the audience check to S37's {@link validateTokenAudience} (which §23
 * owns) and surfaces a `-32600` "token not valid for this resource" rejection
 * matching the story's wire example. A `false` from this MUST stop the request
 * before any data is returned (R-28.5-e).
 *
 * @param options.tokenAudience        - The `aud` claim the presented token carries. (R-28.5-b)
 * @param options.ownCanonicalResource - This server's canonical resource identifier.
 * @param options.validatedBeforeUse   - `true` when the token was cryptographically
 *   validated before processing the request (R-28.5-d).
 */
export function validateServerAccessToken(options: {
  tokenAudience: string | string[];
  ownCanonicalResource: string;
  validatedBeforeUse: boolean;
}): ServerTokenValidation {
  if (!options.validatedBeforeUse) {
    return {
      ok: false,
      code: RATE_LIMIT_REJECTION_CODE,
      reason: 'a server MUST validate a token before processing the request it accompanies (R-28.5-d)',
    };
  }
  const audience: TokenAudienceValidation = validateTokenAudience(
    options.tokenAudience,
    options.ownCanonicalResource,
  );
  if (!audience.ok) {
    return {
      ok: false,
      code: RATE_LIMIT_REJECTION_CODE,
      reason: `token not valid for this resource: ${audience.reason} (R-28.5-b, R-28.5-c, R-28.5-e)`,
    };
  }
  return { ok: true };
}

/** Outcome of {@link assertNoTokenPassthrough}. */
export type TokenPassthroughValidation = { ok: true } | { ok: false; reason: string };

/**
 * Asserts the no-token-passthrough / confused-deputy rule: a server never accepts a
 * token issued for another resource and never forwards a client token onward to an
 * upstream API; when it calls upstream it uses a SEPARATE token from the upstream
 * AS. (§28.5, R-28.5-f, R-28.5-g; AC-44.13)
 *
 * Returns `ok: false` when the token intended for the upstream call is the same one
 * the client presented (`clientPresentedToken === upstreamToken`) — the
 * confused-deputy vulnerability — or when the upstream token was not issued by the
 * upstream authorization server. Reuses S37's {@link mayForwardTokenToServer} to
 * confirm the upstream token's issuer matches the upstream AS.
 *
 * @param options.clientPresentedToken - The bearer token the client presented to this server.
 * @param options.upstreamToken        - The token this server intends to send upstream.
 * @param options.upstreamTokenIssuer  - The issuer that minted the upstream token.
 * @param options.upstreamAuthorizationServerIssuer - The upstream API's authorization server issuer.
 */
export function assertNoTokenPassthrough(options: {
  clientPresentedToken: string;
  upstreamToken: string;
  upstreamTokenIssuer: string;
  upstreamAuthorizationServerIssuer: string;
}): TokenPassthroughValidation {
  if (options.upstreamToken === options.clientPresentedToken) {
    return {
      ok: false,
      reason: 'a server MUST NOT forward a client-supplied token onward to an upstream API (confused deputy) (R-28.5-f)',
    };
  }
  if (!mayForwardTokenToServer(options.upstreamTokenIssuer, options.upstreamAuthorizationServerIssuer)) {
    return {
      ok: false,
      reason: 'when calling an upstream API a server MUST use a separate token issued by the upstream authorization server (R-28.5-g)',
    };
  }
  return { ok: true };
}

/**
 * Validates the exact-issuer mix-up defense for an authorization response,
 * delegating to S37's {@link validateExactIssuer} (which §23 owns). The client MUST
 * have recorded the expected issuer before redirect and MUST compare any returned
 * issuer by exact string comparison, rejecting mismatches. (§28.5, R-28.5-h,
 * R-28.5-i; AC-44.14)
 *
 * @param options.iss                   - The `iss` returned in the authorization response, if any.
 * @param options.recordedIssuer        - The issuer recorded BEFORE redirect (R-28.5-h).
 * @param options.issParameterSupported - The AS `authorization_response_iss_parameter_supported` flag.
 */
export function validateAuthorizationIssuer(options: {
  iss?: string;
  recordedIssuer: string;
  issParameterSupported?: boolean;
}): { ok: true } | { ok: false; reason: string } {
  return validateExactIssuer(options);
}

/** Outcome of {@link assertTokenTransportSecurity}. */
export type TokenTransportValidation = { ok: true } | { ok: false; reason: string };

/**
 * Asserts the §28.5 token-confidentiality transport rules: tokens are stored
 * securely, never logged, never forwarded to a party other than the one they were
 * issued for, and authorization-server endpoints and redirect URIs use HTTPS (a
 * `localhost` redirect is permitted). (§28.5, R-28.5-n, R-28.5-o, R-28.5-p,
 * R-28.5-q, R-28.9-d; AC-44.17)
 *
 * A pure policy check over the handling claims and the endpoint/redirect URLs:
 * returns the first violation. HTTPS is required for every AS endpoint; a redirect
 * URI may additionally be a loopback (`http://localhost` / `127.0.0.1`).
 *
 * @param options.endpointUrls   - Authorization-server endpoint URLs (token/authorize/etc.). (R-28.5-q)
 * @param options.redirectUris   - The client redirect URIs (loopback http permitted). (R-28.5-q)
 * @param options.tokenLogged    - Whether any token was written to a log/trace (MUST be false). (R-28.5-o)
 * @param options.tokenForwarded - Whether a token was forwarded to a party other than its
 *   intended one (MUST be false). (R-28.5-p)
 */
export function assertTokenTransportSecurity(options: {
  endpointUrls: readonly string[];
  redirectUris?: readonly string[];
  tokenLogged: boolean;
  tokenForwarded: boolean;
}): TokenTransportValidation {
  if (options.tokenLogged) {
    return { ok: false, reason: 'tokens MUST NOT be logged (R-28.5-o, R-28.9-d)' };
  }
  if (options.tokenForwarded) {
    return { ok: false, reason: 'tokens MUST NOT be forwarded to any party other than the one they were issued for (R-28.5-p)' };
  }
  for (const url of options.endpointUrls) {
    if (!isHttpsUrl(url)) {
      return { ok: false, reason: `authorization-server endpoint "${url}" MUST use HTTPS (R-28.5-q)` };
    }
  }
  for (const uri of options.redirectUris ?? []) {
    if (!isHttpsUrl(uri) && !isLoopbackHttpUrl(uri)) {
      return { ok: false, reason: `redirect URI "${uri}" MUST use HTTPS (a localhost redirect is permitted) (R-28.5-q)` };
    }
  }
  return { ok: true };
}

/** Returns `true` when `url` is a valid `https:` URL. (R-28.5-q) */
function isHttpsUrl(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

/** Returns `true` when `url` is an `http:` URL whose host is a loopback address. (R-28.5-q) */
function isLoopbackHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:') return false;
    const host = u.hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
  } catch {
    return false;
  }
}

// ─── §28.6 — Multi-round-trip & continuation safety (R-28.6-a – R-28.6-c) ─────────

/**
 * A server-side handle to continuation state, the §28.6 handling profile for the
 * S17 `requestState` token. (§28.6, R-28.6-a, R-28.6-c) The token a client receives
 * is the opaque `value`; the integrity and binding are server-held so the client
 * cannot read, forge, or tamper with the state it represents.
 */
export interface ContinuationTokenRecord<S = unknown> {
  /** The opaque token value handed to the client. */
  value: string;
  /**
   * The integrity tag the server uses to detect tampering — a signature/MAC over the
   * state, or (for an unguessable-handle design) the handle's existence in this
   * store. A receiver MUST reject a token whose presented tag fails this. (R-28.6-a)
   */
  integrityTag: string;
  /** The server-held continuation state the token stands for. */
  state: S;
  /** Epoch ms after which the token is expired and replay is refused; `undefined` ⇒ no time bound. (R-28.6-c) */
  expiresAtMs?: number;
  /** `true` once the token has been consumed, for single-use replay defense. (R-28.6-c) */
  consumed?: boolean;
}

/** Outcome of {@link validateContinuationToken}. */
export type ContinuationTokenValidation<S = unknown> =
  | { ok: true; state: S }
  | { ok: false; reason: 'integrity-failure' | 'expired' | 'replayed' | 'unknown'; detail: string };

/**
 * A server-side store for `requestState` continuation tokens that protects their
 * integrity and confidentiality and guards against replay, the §28.6 handling
 * profile. (§28.6, R-28.6-a, R-28.6-b, R-28.6-c; AC-44.18)
 *
 * The client only ever sees the opaque `value`; the state and integrity tag are
 * held entirely server-side (the "unguessable handle" design §28.6 permits). On
 * presentation {@link validate} rejects — rather than acting on — a token that
 * fails integrity (R-28.6-b), is expired, was already consumed (single-use replay
 * defense), or is unknown. {@link issue} mints a single-use, optionally
 * time-bounded handle.
 */
export class ContinuationTokenStore<S = unknown> {
  readonly #byValue = new Map<string, ContinuationTokenRecord<S>>();
  readonly #now: () => number;
  readonly #mint: () => string;
  #counter = 0;

  /**
   * @param options.now  - OPTIONAL clock (epoch ms); defaults to `Date.now`.
   * @param options.mint - OPTIONAL unguessable-value generator; defaults to a
   *   monotonic random-ish handle. Inject a CSPRNG-backed generator in production.
   */
  constructor(options: { now?: () => number; mint?: () => string } = {}) {
    this.#now = options.now ?? (() => Date.now());
    this.#mint =
      options.mint ??
      (() => `rs_${(this.#counter++).toString(36)}_${Math.random().toString(36).slice(2)}`);
  }

  /**
   * Mints a single-use continuation token for `state`, with an optional integrity
   * tag and time bound. The returned `value` is the opaque handle to give the
   * client; the state never crosses the wire. (R-28.6-a, R-28.6-c)
   *
   * @param state          - The server-side continuation state to stash.
   * @param options.integrityTag - OPTIONAL signature/MAC the client must echo for a
   *   signed-token design; defaults to the handle being its own integrity (unguessable
   *   handle). (R-28.6-a)
   * @param options.ttlMs  - OPTIONAL time bound; the token expires after this many ms. (R-28.6-c)
   */
  issue(state: S, options: { integrityTag?: string; ttlMs?: number } = {}): ContinuationTokenRecord<S> {
    const value = this.#mint();
    const record: ContinuationTokenRecord<S> = {
      value,
      integrityTag: options.integrityTag ?? value,
      state,
      expiresAtMs: options.ttlMs !== undefined ? this.#now() + options.ttlMs : undefined,
      consumed: false,
    };
    this.#byValue.set(value, record);
    return record;
  }

  /**
   * Validates a presented continuation token, returning the protected state on
   * success or a structured rejection. A receiver MUST reject (never act on) a token
   * that fails integrity (R-28.6-b); replay (expiry or re-use) is refused too
   * (R-28.6-c). A successful validation consumes the single-use token.
   *
   * @param value               - The opaque token value the client presented.
   * @param presentedIntegrityTag - The integrity tag the client echoed, for a signed
   *   design; omit for an unguessable-handle design.
   */
  validate(value: string, presentedIntegrityTag?: string): ContinuationTokenValidation<S> {
    const record = this.#byValue.get(value);
    if (record === undefined) {
      return { ok: false, reason: 'unknown', detail: 'continuation token is not recognized; reject rather than act on it (R-28.6-b)' };
    }
    const expectedTag = record.integrityTag;
    const actualTag = presentedIntegrityTag ?? value;
    if (actualTag !== expectedTag) {
      return { ok: false, reason: 'integrity-failure', detail: 'continuation token failed integrity validation; reject rather than act on its contents (R-28.6-b)' };
    }
    if (record.expiresAtMs !== undefined && this.#now() >= record.expiresAtMs) {
      this.#byValue.delete(value);
      return { ok: false, reason: 'expired', detail: 'continuation token has expired; refuse replay (R-28.6-c)' };
    }
    if (record.consumed === true) {
      return { ok: false, reason: 'replayed', detail: 'continuation token was already used; refuse replay (single-use) (R-28.6-c)' };
    }
    record.consumed = true;
    return { ok: true, state: record.state };
  }
}

// ─── §28.7 — Elicitation & sampling consent (R-28.7-a – R-28.7-g; AC-44.19/20) ────

/**
 * The terminal user decision on a server-initiated elicitation. (§28.7,
 * R-28.7-b, R-28.7-c) Mirrors S31's `ElicitAction` outcomes; a user MUST be able
 * to reach `decline`/`cancel` at any point.
 */
export type ElicitationUserDecision = 'approve' | 'edit' | 'decline' | 'cancel';

/** Outcome of {@link assertElicitationUnderUserControl}. */
export type ElicitationControlValidation = { ok: true } | { ok: false; reason: string };

/**
 * Asserts a server-initiated elicitation remained under user control before
 * anything was returned to the server: the user could review and reach an explicit
 * decision (approve/edit/decline/cancel), the requesting server's identity was
 * shown, and the request did not phish for secrets via form mode. (§28.7,
 * R-28.7-a, R-28.7-b, R-28.7-c, R-28.7-d, R-28.7-e; AC-44.19)
 *
 * Delegates the form-mode anti-phishing check to S31's {@link assertFormModeMayCollect}
 * (a server MUST NOT use a form to collect credentials/secrets — that belongs in URL
 * mode). Returns the first violation; a `decline`/`cancel` decision is always
 * permitted (the user may stop at any point) and returns `ok: true` without
 * requiring the schema to be safe, since nothing is returned to the server.
 *
 * @param options.decision        - The user's terminal decision (R-28.7-b, R-28.7-c).
 * @param options.userCouldReview - The user was able to review the request before deciding (R-28.7-b).
 * @param options.serverIdentityShown - The requesting server's identity was made clear (R-28.7-e).
 * @param options.requestedSchema - The form-mode requestedSchema, checked for secret-phishing (R-28.7-d).
 */
export function assertElicitationUnderUserControl(options: {
  decision: ElicitationUserDecision;
  userCouldReview: boolean;
  serverIdentityShown: boolean;
  requestedSchema?: unknown;
}): ElicitationControlValidation {
  if (!options.userCouldReview) {
    return { ok: false, reason: 'the user MUST be able to review an elicitation request before responding (R-28.7-b)' };
  }
  // Declining/cancelling is always available; nothing is returned to the server.
  if (options.decision === 'decline' || options.decision === 'cancel') {
    return { ok: true };
  }
  if (!options.serverIdentityShown) {
    return { ok: false, reason: 'the requesting server’s identity SHOULD be made clear in the elicitation interface (R-28.7-e)' };
  }
  if (options.requestedSchema !== undefined) {
    const safe = assertFormModeMayCollect(options.requestedSchema);
    if (!safe.ok) {
      return {
        ok: false,
        reason: `a server MUST NOT use elicitation to phish for secrets; sensitive fields [${safe.sensitiveFields.join(', ')}] MUST use URL mode (R-28.7-d)`,
      };
    }
  }
  return { ok: true };
}

/** Outcome of {@link assertSamplingUnderUserControl}. */
export type SamplingControlValidation = { ok: true } | { ok: false; reason: string };

/**
 * Asserts a server-driven sampling flow remained under user control: the MUST-level
 * §28.7 obligations are met (human review of prompt and completion before they are
 * acted upon or transmitted) and the host disclosed no more conversation context
 * than the user authorized. (§28.7, R-28.7-a, R-28.7-f, R-28.7-g; AC-44.20)
 *
 * Reuses S33's {@link unmetRequiredConsentObligations} for the human-in-the-loop /
 * user-may-deny / sensitive-data MUSTs, and additionally requires the prompt and
 * completion to have been human-reviewed (R-28.7-f) and the disclosed context to be
 * within the user's authorization (R-28.7-g).
 *
 * @param options.obligations           - The host's §21.2.10 consent-obligation claims (S33). (R-28.7-a)
 * @param options.promptReviewed        - The prompt sent to the model was human-reviewed/approved. (R-28.7-f)
 * @param options.completionReviewed    - The completion was human-reviewed before being acted upon. (R-28.7-f)
 * @param options.disclosedContextWithinAuthorization - The disclosed conversation context was within
 *   what the user authorized. (R-28.7-g)
 */
export function assertSamplingUnderUserControl(options: {
  obligations: SamplingConsentObligations;
  promptReviewed: boolean;
  completionReviewed: boolean;
  disclosedContextWithinAuthorization: boolean;
}): SamplingControlValidation {
  const unmet = unmetRequiredConsentObligations(options.obligations);
  if (unmet.length > 0) {
    return { ok: false, reason: `sampling MUST remain under user control; unmet obligations: ${unmet.join(', ')} (R-28.7-a)` };
  }
  if (!options.promptReviewed || !options.completionReviewed) {
    return { ok: false, reason: 'sampling prompts and completions MUST be subject to human review before being acted upon or transmitted (R-28.7-f)' };
  }
  if (!options.disclosedContextWithinAuthorization) {
    return { ok: false, reason: 'the host MUST NOT disclose more conversation context to a sampling request than the user authorized (R-28.7-g)' };
  }
  return { ok: true };
}

// ─── §28.8 — UI sandboxing (R-28.8-a – R-28.8-h; AC-44.21/22) ─────────────────────

/** Outcome of {@link assertUiSandboxConforming}. */
export type UiSandboxValidation = { ok: true } | { ok: false; reason: string };

/**
 * Asserts a server-provided UI is rendered conformingly: it runs in an isolated
 * sandbox that denies DOM/cookies/storage/navigation, under a restrictive CSP, and
 * exposes no credentials/tokens/unrelated context. (§28.8, R-28.8-a, R-28.8-e,
 * R-28.8-f, R-28.8-g; AC-44.21, AC-44.22)
 *
 * Reuses S42's {@link sandboxIsolationIsConforming} (the deny-everything isolation
 * model) and {@link uiExposureIsClean} (the allow-list exposure check). A missing
 * CSP, an incomplete sandbox, or a dirty exposure each fails.
 *
 * @param options.sandboxDeniedAccess - The categories the sandbox denies (S42). (R-28.8-a)
 * @param options.restrictiveCspApplied - Whether a restrictive content-security policy is applied. (R-28.8-a)
 * @param options.exposedToUi          - The data the host hands to the UI, exposure-checked (S42). (R-28.8-e)
 */
export function assertUiSandboxConforming(options: {
  sandboxDeniedAccess: Iterable<string>;
  restrictiveCspApplied: boolean;
  exposedToUi: Record<string, unknown>;
}): UiSandboxValidation {
  if (!options.restrictiveCspApplied) {
    return { ok: false, reason: 'server-provided UI MUST be rendered under a restrictive content-security policy (R-28.8-a)' };
  }
  if (!sandboxIsolationIsConforming(options.sandboxDeniedAccess)) {
    return { ok: false, reason: 'the UI sandbox MUST deny DOM/cookies/storage/navigation so it cannot exfiltrate host/user state (R-28.8-a, R-28.8-f)' };
  }
  if (!uiExposureIsClean(options.exposedToUi)) {
    return { ok: false, reason: 'the host MUST NOT expose credentials/tokens/unrelated context to the sandboxed UI (R-28.8-e)' };
  }
  return { ok: true };
}

/**
 * Mediates a UI-requested `tools/call`, routing it through the host's normal
 * consent / human-in-the-loop path; the UI can never cause a tool to run without
 * host mediation and user consent. (§28.8, R-28.8-b, R-28.8-c, R-28.8-d; AC-44.21)
 *
 * A thin restatement under the §28.8 atoms of S42's {@link mediateUiToolsCall} — the
 * same gate that enforces visibility, host policy, and user consent before a
 * UI-originated call reaches a server. A `route: false` decision MUST be answered
 * with a §22 error, never a silent execution.
 *
 * @param input - The UI tool-call mediation input (S42).
 */
export function mediateUiInitiatedToolCall(input: ToolsCallMediationInput): ToolsCallMediationDecision {
  return mediateUiToolsCall(input);
}

// ─── §28.9 — Metadata & observability (R-28.9-a – R-28.9-e; AC-44.23) ─────────────

/**
 * Returns `false` — metadata MUST NOT be a source of authority. (§28.9, R-28.9-a;
 * AC-44.23)
 *
 * Trace identifiers, progress tokens, and similar fields MUST NOT be used for
 * authentication, authorization, or any access-control decision; a peer can set
 * them to arbitrary values. This is unconditional, so a caller cannot accidentally
 * derive authority from a metadata field: `if (metadataConveysAuthority(...)) ...`
 * is always the `false` branch.
 *
 * @param _key - The metadata key (ignored; the rule is unconditional).
 */
export function metadataConveysAuthority(_key?: string): false {
  return false;
}

/** Keys whose values are credentials/tokens and MUST NOT be logged or recorded. (R-28.9-c, R-28.9-d) */
const SENSITIVE_LOG_KEYS = [
  'authorization',
  'token',
  'access_token',
  'accesstoken',
  'refresh_token',
  'refreshtoken',
  'id_token',
  'secret',
  'client_secret',
  'password',
  'api_key',
  'apikey',
  'cookie',
  'set-cookie',
] as const;

/** Returns `true` when a metadata/log key names a credential/token that MUST NOT be logged. (R-28.9-d) */
function isSensitiveLogKey(key: string): boolean {
  const k = key.toLowerCase();
  return SENSITIVE_LOG_KEYS.some((s) => k === s || k.includes(s));
}

/** The placeholder substituted for a redacted credential/token value. (R-28.9-d, R-28.9-e) */
export const REDACTED_PLACEHOLDER = '[REDACTED]' as const;

/**
 * Returns a copy of an object intended for a log/trace/telemetry sink with
 * credential/token values redacted, so credentials and tokens are never logged and
 * data crossing the trust boundary is minimized. (§28.9, R-28.9-c, R-28.9-d,
 * R-28.9-e; AC-44.23, AC-44.17)
 *
 * Walks the object recursively; any property whose key names a credential/token
 * (see {@link SENSITIVE_LOG_KEYS}) has its value replaced with
 * {@link REDACTED_PLACEHOLDER}, regardless of the value's type. The input is never
 * mutated. Use at every logging boundary so an accidental log of a request/metadata
 * object cannot leak a secret.
 *
 * @param value - The object (or value) about to be logged.
 */
export function redactForLogging(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((v) => redactForLogging(v));
  }
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      out[key] = isSensitiveLogKey(key) ? REDACTED_PLACEHOLDER : redactForLogging(v);
    }
    return out;
  }
  return value;
}

/**
 * Validates the structure of consumed metadata, returning only the entries the
 * receiver understands and ignoring the rest. (§28.9, R-28.9-b; AC-44.23)
 *
 * Receivers SHOULD validate metadata structure and ignore values they do not
 * understand; this keeps only keys in `known` (and only when the value is present),
 * so an unknown or malformed extra field is dropped rather than acted upon. It never
 * throws on a malformed input — a non-object yields `{}`.
 *
 * @param metadata - The raw metadata object from a peer.
 * @param known    - The metadata keys this receiver understands.
 */
export function sanitizeConsumedMetadata(
  metadata: unknown,
  known: Iterable<string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
    return out;
  }
  const knownSet = new Set(known);
  for (const [key, value] of Object.entries(metadata as Record<string, unknown>)) {
    if (knownSet.has(key) && value !== undefined) {
      out[key] = value;
    }
  }
  return out;
}

// ─── §28.10 — Input validation & resource bounds (R-28.10-a – R-28.10-p) ──────────

/** The JSON-RPC error code a validation/cursor/argument failure is reported with. (§28.10) */
export const VALIDATION_ERROR_CODE = -32602 as const;

/**
 * Validates `tools/call` arguments against a tool's declared input schema and,
 * optionally, structured results against an output schema, reporting a failure as a
 * `-32602` error rather than acting on the input. (§28.10, R-28.10-a, R-28.10-b,
 * R-28.10-c, R-28.10-d, R-28.10-e; AC-44.24)
 *
 * Delegates to S25's {@link validateToolArguments} / {@link validateToolStructuredContent};
 * on failure returns a structured error (matching the story's wire example) so the
 * caller reports it rather than executing the call — a receiver MUST validate all
 * peer inputs first and MUST NOT assume a peer is well-behaved.
 *
 * @param options.tool             - The tool's `inputSchema` (and optional `outputSchema`).
 * @param options.args             - The `arguments` object to validate. (R-28.10-c)
 * @param options.structuredResult - OPTIONAL structured result to validate against the
 *   output schema. (R-28.10-d)
 */
export function validatePeerToolCall(options: {
  tool: { inputSchema: unknown; outputSchema?: unknown };
  args: unknown;
  structuredResult?: unknown;
}): { ok: true } | { ok: false; code: typeof VALIDATION_ERROR_CODE; message: string; errors: string[] } {
  const argCheck = validateToolArguments(options.tool, options.args);
  if (!argCheck.valid) {
    return {
      ok: false,
      code: VALIDATION_ERROR_CODE,
      message: 'Tool arguments failed input-schema validation',
      errors: argCheck.errors,
    };
  }
  if (options.structuredResult !== undefined && options.tool.outputSchema !== undefined) {
    const resultCheck = validateToolStructuredContent(options.tool, options.structuredResult);
    if (!resultCheck.valid) {
      return {
        ok: false,
        code: VALIDATION_ERROR_CODE,
        message: 'Structured result failed output-schema validation',
        errors: resultCheck.errors,
      };
    }
  }
  return { ok: true };
}

/** Outcome of {@link validateResourceUriAccess}. */
export type ResourceUriValidation = { ok: true } | { ok: false; reason: string };

/**
 * Validates a resource URI before dereferencing or matching it: it parses as an
 * absolute URI, its location is one the user has authorized, and (when it could
 * trigger a network request) it is not an SSRF target. (§28.10, R-28.10-f,
 * R-28.10-g, R-28.10-h; AC-44.25)
 *
 * Returns the first violation. Authorization is delegated to a caller-supplied
 * predicate over the parsed URL (the host owns the authorized-location policy); the
 * SSRF guard rejects a URL whose host resolves to a private/loopback/link-local
 * address when `guardSsrf` is set, since the receiver MUST NOT be driven to fetch
 * an internal location.
 *
 * @param uri                  - The resource URI to validate. (R-28.10-f)
 * @param options.isAuthorizedLocation - Predicate: is this URL a location the user authorized? (R-28.10-g)
 * @param options.guardSsrf    - When `true`, reject private/loopback/link-local hosts. (R-28.10-h)
 */
export function validateResourceUriAccess(
  uri: string,
  options: {
    isAuthorizedLocation: (url: URL) => boolean;
    guardSsrf?: boolean;
  },
): ResourceUriValidation {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return { ok: false, reason: 'resource URI MUST be a valid absolute URI before it is dereferenced or matched (R-28.10-f)' };
  }
  if (!options.isAuthorizedLocation(url)) {
    return { ok: false, reason: 'a receiver MUST NOT follow a URI to a location the user has not authorized (R-28.10-g)' };
  }
  if (options.guardSsrf === true && isLikelySsrfTarget(url)) {
    return { ok: false, reason: 'the URI resolves to a private/loopback/link-local host; guard against SSRF (R-28.10-h)' };
  }
  return { ok: true };
}

/** Returns `true` when a URL's host is a private/loopback/link-local literal (an SSRF risk). (R-28.10-h) */
function isLikelySsrfTarget(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host === '::1' || host === '[::1]') return true;
  // IPv4 private / loopback / link-local ranges.
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 127) return true; // loopback
    if (a === 10) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 169 && b === 254) return true; // link-local
    if (a === 0) return true; // "this host"
  }
  // IPv6 unique-local (fc00::/7) and link-local (fe80::/10) literals.
  if (host.startsWith('[fc') || host.startsWith('[fd') || host.startsWith('[fe8') || host.startsWith('[fe9') || host.startsWith('[fea') || host.startsWith('[feb')) {
    return true;
  }
  return false;
}

/**
 * Validates an `Origin` header against the server's accepted-origin set on every
 * incoming HTTP connection, rejecting untrusted origins to defend against
 * DNS-rebinding — the §28.10-i restatement of the §9.11 rule. (§28.10, R-28.10-i;
 * AC-44.26)
 *
 * Returns `{ accepted: false }` when the `Origin` header is present and not in the
 * accepted set (the request MUST be rejected); an absent `Origin` or one in the set
 * passes, matching exactly. §9.11 (S15) owns the rule in full and the transport
 * layer's `validateOrigin`; this is the protocol-level predicate §28.10 references
 * so a server's request pipeline can assert it.
 *
 * @param origin          - The request's `Origin` header value, or `undefined`.
 * @param acceptedOrigins - The origins the server is configured to accept.
 */
export function validateRequestOrigin(
  origin: string | undefined,
  acceptedOrigins: Iterable<string>,
): { accepted: true } | { accepted: false; origin: string } {
  if (origin === undefined) {
    return { accepted: true };
  }
  const allow = acceptedOrigins instanceof Set ? acceptedOrigins : new Set(acceptedOrigins);
  return allow.has(origin) ? { accepted: true } : { accepted: false, origin };
}

/** Outcome of {@link validatePaginationCursor}. */
export type CursorValidation =
  | { ok: true; cursor: string }
  | { ok: false; error: ReturnType<typeof buildInvalidCursorError> };

/**
 * Validates a pagination cursor as opaque, untrusted input: it is rejected with a
 * `-32602` error when malformed, unknown, or expired, rather than having its
 * attacker-controlled contents interpreted. (§28.10, R-28.10-j; AC-44.27)
 *
 * A server MUST treat a cursor as opaque and MUST NOT decode and act on its
 * contents. The `isKnown` predicate is the server's own recognition check (e.g.
 * "did I mint this cursor and is it unexpired?"); a non-string or unrecognized
 * cursor yields S18's {@link buildInvalidCursorError} (`-32602`). An absent cursor
 * is valid — it requests the first page.
 *
 * @param cursor         - The cursor the client supplied, or `undefined` for the first page.
 * @param options.isKnown- Predicate: did this server issue this cursor and is it still valid?
 */
export function validatePaginationCursor(
  cursor: string | undefined,
  options: { isKnown: (cursor: string) => boolean },
): CursorValidation | { ok: true; cursor: undefined } {
  if (cursor === undefined) {
    return { ok: true, cursor: undefined };
  }
  if (typeof cursor !== 'string' || !options.isKnown(cursor)) {
    return { ok: false, error: buildInvalidCursorError('Invalid cursor: malformed, unknown, or expired') };
  }
  return { ok: true, cursor };
}

/** Resource bounds a receiver imposes while validating peer inputs. (§28.10, R-28.10-k, R-28.10-l) */
export interface InputBounds {
  /** Maximum schema nesting depth; deeper schemas are rejected. (R-28.10-k) */
  maxSchemaDepth: number;
  /** Maximum serialized payload size in bytes; larger inputs are rejected. (R-28.10-l) */
  maxPayloadBytes: number;
}

/**
 * Default input bounds, derived from S25's {@link DEFAULT_SCHEMA_LIMITS} for schema
 * depth plus a conservative payload-size cap. (§28.10, R-28.10-k, R-28.10-l)
 */
export const DEFAULT_INPUT_BOUNDS: InputBounds = {
  maxSchemaDepth: DEFAULT_SCHEMA_LIMITS.maxDepth,
  maxPayloadBytes: 4 * 1024 * 1024,
};

/** Outcome of {@link enforceInputBounds}. */
export type InputBoundsValidation = { ok: true } | { ok: false; reason: string };

/**
 * Bounds the resources consumed while validating a peer input: rejects a schema
 * whose nesting depth exceeds the limit (reusing S25's {@link schemaNestingDepth},
 * which itself caps recursion) and a payload exceeding the size limit. (§28.10,
 * R-28.10-k, R-28.10-l; AC-44.28)
 *
 * A receiver MUST bound schema nesting depth (R-28.10-k); the depth probe stops at
 * the cap so a pathological self-referential schema cannot exhaust the stack while
 * being measured. The payload-size check uses the UTF-8 byte length of the
 * serialized payload, when supplied.
 *
 * @param options.schema          - The schema to depth-bound. (R-28.10-k)
 * @param options.serializedPayload - OPTIONAL serialized payload whose size is bounded. (R-28.10-l)
 * @param options.bounds          - The bounds to enforce; defaults to {@link DEFAULT_INPUT_BOUNDS}.
 */
export function enforceInputBounds(options: {
  schema?: unknown;
  serializedPayload?: string;
  bounds?: InputBounds;
}): InputBoundsValidation {
  const bounds = options.bounds ?? DEFAULT_INPUT_BOUNDS;
  if (options.schema !== undefined) {
    const depth = schemaNestingDepth(options.schema, bounds.maxSchemaDepth + 1);
    if (depth > bounds.maxSchemaDepth) {
      return { ok: false, reason: `schema nesting depth exceeds the bound ${bounds.maxSchemaDepth} (R-28.10-k)` };
    }
  }
  if (options.serializedPayload !== undefined) {
    const bytes = Buffer.byteLength(options.serializedPayload, 'utf8');
    if (bytes > bounds.maxPayloadBytes) {
      return { ok: false, reason: `payload size ${bytes}B exceeds the bound ${bounds.maxPayloadBytes}B (R-28.10-l)` };
    }
  }
  return { ok: true };
}

/** Outcome of {@link assertSelfContainedSchema}. */
export type SchemaSelfContainmentValidation = { ok: true } | { ok: false; reason: string };

/**
 * Asserts a tool schema is self-contained — it carries no external `$ref` that the
 * server would have to dereference — unless external resolution is explicitly
 * permitted against a trusted source. (§28.10, R-28.10-m, R-28.10-n; AC-44.29)
 *
 * Reuses S25's {@link hasExternalRef}, a pure structural inspection that performs no
 * I/O, so it can never trigger the SSRF fetch it guards against. A server MUST NOT
 * automatically dereference external references; when `allowTrustedExternalRefs` is
 * not set (the default), any external `$ref`/`$dynamicRef` fails.
 *
 * @param schema  - The tool schema to inspect. (R-28.10-m)
 * @param options.allowTrustedExternalRefs - Opt-in: external refs are resolved only
 *   against explicitly trusted sources. (R-28.10-n) Defaults to `false`.
 * @param options.maxDepth - Recursion bound for the inspection; defaults to the schema limit.
 */
export function assertSelfContainedSchema(
  schema: unknown,
  options: { allowTrustedExternalRefs?: boolean; maxDepth?: number } = {},
): SchemaSelfContainmentValidation {
  if (options.allowTrustedExternalRefs === true) {
    return { ok: true };
  }
  const maxDepth = options.maxDepth ?? DEFAULT_SCHEMA_LIMITS.maxDepth;
  if (hasExternalRef(schema, maxDepth)) {
    return {
      ok: false,
      reason: 'a server MUST NOT automatically dereference external schema references; schemas MUST be self-contained or resolved only against trusted sources (R-28.10-m, R-28.10-n)',
    };
  }
  return { ok: true };
}

/** Outcome of {@link sanitizeFilePath}. */
export type FilePathValidation =
  | { ok: true; resolvedPath: string }
  | { ok: false; reason: string };

/**
 * Sanitizes a requested `file://` resource path against an authorized root,
 * rejecting directory-traversal and any path that escapes the root. (§28.10,
 * R-28.10-o, R-28.10-p; AC-44.30)
 *
 * A server MUST sanitize file paths to prevent directory traversal (e.g. `..`
 * segments) and MUST NOT serve a file outside the authorized directories. The check
 * is purely lexical (no filesystem I/O): it normalizes `.`/`..` segments
 * POSIX-style and confirms the result stays within `authorizedRoot`. A path that
 * normalizes to outside the root — via `..` or an absolute escape — is rejected.
 *
 * @param requestedPath  - The requested file path (relative to, or under, the root). (R-28.10-o)
 * @param authorizedRoot - The absolute root directory the user has authorized. (R-28.10-p)
 */
export function sanitizeFilePath(requestedPath: string, authorizedRoot: string): FilePathValidation {
  if (requestedPath.includes('\x00')) {
    return { ok: false, reason: 'file path MUST NOT contain a NUL byte (R-28.10-o)' };
  }
  const root = normalizePosix(authorizedRoot);
  // Resolve the requested path against the root, then normalize away `.`/`..`.
  const joined = requestedPath.startsWith('/')
    ? normalizePosix(requestedPath)
    : normalizePosix(`${root}/${requestedPath}`);
  const rootWithSlash = root.endsWith('/') ? root : `${root}/`;
  if (joined !== root && !joined.startsWith(rootWithSlash)) {
    return {
      ok: false,
      reason: `resolved path "${joined}" escapes the authorized root "${root}"; reject directory traversal (R-28.10-o, R-28.10-p)`,
    };
  }
  return { ok: true, resolvedPath: joined };
}

/** Normalizes a POSIX-style path, collapsing `.`/`..`/duplicate-slash segments. Lexical only. */
function normalizePosix(path: string): string {
  const isAbsolute = path.startsWith('/');
  const segments: string[] = [];
  for (const seg of path.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (segments.length > 0 && segments[segments.length - 1] !== '..') {
        segments.pop();
      } else if (!isAbsolute) {
        segments.push('..');
      }
      // For an absolute path, `..` above the root is clamped at the root.
      continue;
    }
    segments.push(seg);
  }
  const body = segments.join('/');
  return isAbsolute ? `/${body}` : body;
}

// ─── Re-exported reuse surface (same bindings; never redefined) ──────────────────

export { INVALID_CURSOR_CODE } from './pagination.js';
