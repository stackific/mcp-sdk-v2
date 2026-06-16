"""S44 — Security Considerations (§28).

The cross-cutting security and trust model every conforming MCP implementation MUST
honor. §28 is a *consolidating* section: it defines no new wire types but binds
together the most critical obligations introduced piecemeal alongside individual
features (tools S25, elicitation S31, sampling S33, authorization S37, UI S42). The
protocol cannot enforce most of these at the wire level, so conformance depends on
implementations honoring them. This module models them as:

  - a **registry** of every numbered §28 requirement atom (id, level, the principle it
    derives from, and a human-readable statement), so an implementation can enumerate
    the baseline and a conformance review can assert coverage
    (:data:`SECURITY_REQUIREMENTS`);
  - **predicates / validators** for the obligations that are checkable in code — consent
    gating, trust classification of untrusted inputs, token handling, continuation-token
    integrity, input/URI/cursor validation, and resource bounds — most of which
    **delegate to the per-feature module that already owns the mechanics** (never
    re-implementing them); and
  - a **checklist** an implementation can assert against to demonstrate it addresses the
    four core principles (:func:`assess_security_baseline`).

Reuse (referenced, never redefined): S25 ``tools.py``
(``validate_tool_arguments``/``validate_tool_structured_content``/``has_external_ref``/
``schema_nesting_depth``/``DEFAULT_SCHEMA_LIMITS``), S25 ``tools_call.py``
(``may_trust_tool_annotations``), S31 ``elicitation_form.py``
(``assert_form_mode_may_collect``), S33 ``sampling.py``
(``SamplingConsentObligations``/``unmet_required_consent_obligations``), S37
``authorization_flow.py`` (``validate_token_audience``) and
``authorization_registration.py`` (``validate_exact_issuer``/
``may_forward_token_to_server``), S42 ``ui_host.py`` (``mediate_ui_tools_call``/
``ui_exposure_is_clean``/``sandbox_isolation_is_conforming``), S18 ``pagination.py``
(``build_invalid_cursor_error``/``INVALID_CURSOR_CODE``). §23 prevails on any
authorization difference, and the Origin/DNS-rebinding rule is owned in full by S15
(§9.11) — restated here only as the §28.10-i predicate.

Mirrors the style of ``negotiation.py`` / ``tools.py``: frozen ``@dataclass`` result
objects (``ok`` + ``reason``), named predicates, and docstrings citing each spec atom +
the AC it covers.
"""

from __future__ import annotations

import re
import time
from dataclasses import dataclass, field
from secrets import token_hex
from urllib.parse import urlsplit

from mcp.protocol.authorization_flow import validate_token_audience
from mcp.protocol.authorization_registration import (
  may_forward_token_to_server,
  validate_exact_issuer,
)
from mcp.protocol.elicitation_form import assert_form_mode_may_collect
from mcp.protocol.pagination import build_invalid_cursor_error
from mcp.protocol.sampling import (
  SamplingConsentObligations,
  unmet_required_consent_obligations,
)
from mcp.protocol.tools import (
  DEFAULT_SCHEMA_LIMITS,
  has_external_ref,
  schema_nesting_depth,
  validate_tool_arguments,
  validate_tool_structured_content,
)
from mcp.protocol.tools_call import may_trust_tool_annotations
from mcp.protocol.ui_host import (
  mediate_ui_tools_call,
  sandbox_isolation_is_conforming,
  ui_exposure_is_clean,
)

# ─── §28 requirement registry ─────────────────────────────────────────────────

#: The four §28.1 core security principles every conforming implementation is built
#: around. (R-28.1-a)
SECURITY_PRINCIPLES = (
  "user-consent-and-control",
  "data-privacy",
  "tool-safety",
  "host-mediated-trust",
)

#: The normative strengths a §28 requirement atom may carry.
SECURITY_REQUIREMENT_LEVELS = ("MUST", "MUST NOT", "SHOULD", "MAY")


@dataclass(frozen=True)
class SecurityRequirement:
  """A single normative §28 requirement, as consolidated by S44."""

  #: The requirement-atom id, e.g. ``"R-28.3-g"``.
  id: str
  #: Its normative strength (``"MUST"`` / ``"MUST NOT"`` / ``"SHOULD"`` / ``"MAY"``).
  level: str
  #: The §28 subsection that states it, e.g. ``"§28.3"``.
  section: str
  #: The core principle it derives from. (§28.1)
  principle: str
  #: A concise restatement of the obligation.
  statement: str


#: Every numbered §28 requirement atom, in spec order — the single enumerable security
#: baseline an implementation must address. (R-28-a, and every R-28.x-y)
#:
#: This is the data behind :func:`assess_security_baseline` and the conformance lookups;
#: each entry carries the atom id used throughout the per-feature modules so a reviewer
#: can trace an obligation to the code that enforces it (e.g. ``R-28.5-b`` → S37
#: ``validate_token_audience``). The protocol cannot enforce these at the wire level
#: (R-28-a), so the registry is the checklist conformance depends on.
SECURITY_REQUIREMENTS: tuple[SecurityRequirement, ...] = (
  # §28 overarching
  SecurityRequirement("R-28-a", "MUST", "§28", "host-mediated-trust", "Address the security/trust obligations of arbitrary data access and code execution; the protocol cannot enforce them at the wire level."),
  # §28.1 core principles
  SecurityRequirement("R-28.1-a", "MUST", "§28.1", "host-mediated-trust", "Be designed around the four core principles: user consent and control, data privacy, tool safety, host-mediated trust."),
  SecurityRequirement("R-28.1-b", "MUST", "§28.1", "user-consent-and-control", "Users explicitly consent to, and understand, all data access and operations."),
  SecurityRequirement("R-28.1-c", "MUST", "§28.1", "user-consent-and-control", "Users retain control over what data is shared and what actions are taken."),
  SecurityRequirement("R-28.1-d", "SHOULD", "§28.1", "user-consent-and-control", "Provide clear interfaces for reviewing and authorizing activities."),
  SecurityRequirement("R-28.1-e", "MUST", "§28.1", "data-privacy", "Obtain explicit user consent before exposing user data to a server."),
  SecurityRequirement("R-28.1-f", "MUST NOT", "§28.1", "data-privacy", "Never transmit resource data elsewhere without user consent."),
  SecurityRequirement("R-28.1-g", "SHOULD", "§28.1", "data-privacy", "Protect user data with appropriate access controls."),
  SecurityRequirement("R-28.1-h", "MUST", "§28.1", "tool-safety", "Treat tools as arbitrary code execution requiring caution."),
  SecurityRequirement("R-28.1-i", "MUST", "§28.1", "tool-safety", "Treat tool-behavior descriptions, including annotations, as untrusted unless from a trusted server."),
  SecurityRequirement("R-28.1-j", "MUST", "§28.1", "tool-safety", "Obtain explicit user consent before invoking any tool."),
  SecurityRequirement("R-28.1-k", "SHOULD", "§28.1", "host-mediated-trust", "Build robust consent/authorization flows, document implications, implement access controls and data protections."),
  # §28.2 user consent and control
  SecurityRequirement("R-28.2-a", "MUST", "§28.2", "user-consent-and-control", "Obtain explicit consent before exposing user data or invoking a tool/elicitation/operation on the user’s behalf."),
  SecurityRequirement("R-28.2-b", "MUST", "§28.2", "user-consent-and-control", "Consent is informed: the user is given enough information to understand it before authorizing."),
  SecurityRequirement("R-28.2-c", "MUST", "§28.2", "user-consent-and-control", "Users can review and authorize activities and can decline them."),
  SecurityRequirement("R-28.2-d", "MUST NOT", "§28.2", "user-consent-and-control", "Never treat absence of an explicit refusal as consent."),
  SecurityRequirement("R-28.2-e", "MUST NOT", "§28.2", "user-consent-and-control", "Never silently escalate an already-granted consent to broader scope or a different operation."),
  SecurityRequirement("R-28.2-f", "MUST", "§28.2", "user-consent-and-control", "Seek fresh consent where an operation differs materially from one already authorized."),
  SecurityRequirement("R-28.2-g", "SHOULD", "§28.2", "user-consent-and-control", "Present consent prompts in a form that cannot be spoofed by server-provided content."),
  # §28.3 tool safety
  SecurityRequirement("R-28.3-a", "MUST", "§28.3", "tool-safety", "Treat a tool invocation as a request to execute arbitrary code with effects the host cannot predict."),
  SecurityRequirement("R-28.3-b", "MUST", "§28.3", "tool-safety", "Treat tool definitions (names, descriptions, schemas, annotations) as untrusted unless from a trusted server."),
  SecurityRequirement("R-28.3-c", "MUST NOT", "§28.3", "tool-safety", "Never rely on a tool annotation (e.g. read-only/non-destructive hint) as a security guarantee."),
  SecurityRequirement("R-28.3-d", "MUST", "§28.3", "tool-safety", "Keep a human in the loop: the user can review, understand, and deny a proposed invocation before it runs."),
  SecurityRequirement("R-28.3-e", "MUST NOT", "§28.3", "tool-safety", "The decision to invoke a tool never rests solely with the model."),
  SecurityRequirement("R-28.3-f", "SHOULD", "§28.3", "tool-safety", "Guard against prompt-injection content reaching the model via descriptions, results, or resource contents."),
  SecurityRequirement("R-28.3-g", "MUST", "§28.3", "tool-safety", "A server rate-limits tools/call invocations."),
  SecurityRequirement("R-28.3-h", "MUST", "§28.3", "tool-safety", "Reject a tools/call that exceeds the rate limit rather than executing it."),
  SecurityRequirement("R-28.3-i", "MUST", "§28.3", "tool-safety", "Sanitize tool outputs before returning them."),
  SecurityRequirement("R-28.3-j", "SHOULD", "§28.3", "tool-safety", "A client shows the tool’s arguments to the user before issuing the call."),
  SecurityRequirement("R-28.3-k", "SHOULD", "§28.3", "tool-safety", "A client applies a per-call timeout and surfaces a failure when it elapses."),
  SecurityRequirement("R-28.3-l", "SHOULD", "§28.3", "tool-safety", "A client logs tool usage for audit, observing §28.9 (never logging credentials/tokens)."),
  # §28.4 data privacy and isolation
  SecurityRequirement("R-28.4-a", "MUST", "§28.4", "data-privacy", "A server receives only the context the host elects to share."),
  SecurityRequirement("R-28.4-b", "MUST NOT", "§28.4", "data-privacy", "Never transmit resource/user data to a server or third party without consent."),
  SecurityRequirement("R-28.4-c", "SHOULD", "§28.4", "data-privacy", "Protect user data with access controls commensurate with its sensitivity."),
  SecurityRequirement("R-28.4-d", "MUST", "§28.4", "data-privacy", "Servers are isolated from one another."),
  SecurityRequirement("R-28.4-e", "MUST NOT", "§28.4", "data-privacy", "One server can never observe the existence, data, or activity of another on the same host."),
  SecurityRequirement("R-28.4-f", "MUST NOT", "§28.4", "data-privacy", "The host never relays one server’s requests/results/context/credentials to another."),
  # §28.5 authorization security (§23 authoritative)
  SecurityRequirement("R-28.5-a", "MUST", "§28.5", "host-mediated-trust", "Satisfy the normative requirements of §23 Authorization when authorization is used."),
  SecurityRequirement("R-28.5-b", "MUST", "§28.5", "host-mediated-trust", "A server validates that every token was issued for it as the intended audience."),
  SecurityRequirement("R-28.5-c", "MUST", "§28.5", "host-mediated-trust", "A server rejects any token not in its audience or it cannot verify was intended for it."),
  SecurityRequirement("R-28.5-d", "MUST", "§28.5", "host-mediated-trust", "A server validates a token before processing the request it accompanies."),
  SecurityRequirement("R-28.5-e", "MUST NOT", "§28.5", "host-mediated-trust", "A server never returns data to an unauthorized party."),
  SecurityRequirement("R-28.5-f", "MUST NOT", "§28.5", "host-mediated-trust", "A server never accepts a token issued for another resource nor forwards a client token upstream."),
  SecurityRequirement("R-28.5-g", "MUST", "§28.5", "host-mediated-trust", "When a server calls an upstream API it uses a separate token from the upstream AS."),
  SecurityRequirement("R-28.5-h", "MUST", "§28.5", "host-mediated-trust", "A client records the expected issuer before redirecting the user agent."),
  SecurityRequirement("R-28.5-i", "MUST", "§28.5", "host-mediated-trust", "A client compares any returned issuer against the recorded value by exact string comparison and rejects mismatches."),
  SecurityRequirement("R-28.5-j", "MUST", "§28.5", "host-mediated-trust", "A client uses PKCE with S256 where technically capable."),
  SecurityRequirement("R-28.5-k", "MUST", "§28.5", "host-mediated-trust", "A client verifies via metadata that the server supports PKCE, refusing to proceed otherwise."),
  SecurityRequirement("R-28.5-l", "SHOULD", "§28.5", "host-mediated-trust", "A client generates and verifies a state value in the authorization code flow."),
  SecurityRequirement("R-28.5-m", "MUST", "§28.5", "host-mediated-trust", "A client discards any result whose state is absent or mismatched."),
  SecurityRequirement("R-28.5-n", "MUST", "§28.5", "host-mediated-trust", "Clients and servers store tokens securely and keep refresh tokens confidential in transit and at rest."),
  SecurityRequirement("R-28.5-o", "MUST NOT", "§28.5", "host-mediated-trust", "Tokens are never logged."),
  SecurityRequirement("R-28.5-p", "MUST NOT", "§28.5", "host-mediated-trust", "Tokens are never forwarded to any party other than the one they were issued for."),
  SecurityRequirement("R-28.5-q", "MUST", "§28.5", "host-mediated-trust", "Authorization-server endpoints and redirect URIs use HTTPS (localhost redirect permitted)."),
  # §28.6 multi-round-trip & continuation safety
  SecurityRequirement("R-28.6-a", "MUST", "§28.6", "host-mediated-trust", "A server protects integrity and confidentiality of the requestState continuation token."),
  SecurityRequirement("R-28.6-b", "MUST", "§28.6", "host-mediated-trust", "A receiver rejects a continuation token that fails integrity validation rather than acting on it."),
  SecurityRequirement("R-28.6-c", "SHOULD", "§28.6", "host-mediated-trust", "Servers guard against replay of continuation tokens (single-use/session/operation binding, time-bounded)."),
  # §28.7 elicitation & sampling consent
  SecurityRequirement("R-28.7-a", "MUST", "§28.7", "user-consent-and-control", "Server-initiated elicitation and server-driven model output remain under user control."),
  SecurityRequirement("R-28.7-b", "MUST", "§28.7", "user-consent-and-control", "For elicitation, the user can review and approve/edit/decline/cancel before anything returns to the server."),
  SecurityRequirement("R-28.7-c", "MUST", "§28.7", "user-consent-and-control", "The user can decline or cancel an elicitation at any point."),
  SecurityRequirement("R-28.7-d", "MUST NOT", "§28.7", "user-consent-and-control", "A server never uses elicitation to phish for credentials or secrets."),
  SecurityRequirement("R-28.7-e", "SHOULD", "§28.7", "user-consent-and-control", "Clients show the requesting server’s identity and treat secret requests as suspect."),
  SecurityRequirement("R-28.7-f", "MUST", "§28.7", "user-consent-and-control", "Sampling prompts and completions are subject to human review before being acted upon or transmitted."),
  SecurityRequirement("R-28.7-g", "MUST NOT", "§28.7", "user-consent-and-control", "The host never discloses more conversation context to a sampling request than the user authorized."),
  # §28.8 UI sandboxing
  SecurityRequirement("R-28.8-a", "MUST", "§28.8", "host-mediated-trust", "Render server-provided UI in an isolated sandbox under a restrictive content-security policy."),
  SecurityRequirement("R-28.8-b", "MUST", "§28.8", "host-mediated-trust", "The host mediates every privileged action the UI requests."),
  SecurityRequirement("R-28.8-c", "MUST", "§28.8", "host-mediated-trust", "A UI-requested tools/call is routed through the normal consent/human-in-the-loop path."),
  SecurityRequirement("R-28.8-d", "MUST NOT", "§28.8", "host-mediated-trust", "The UI can never cause a tool to run without host mediation and user consent."),
  SecurityRequirement("R-28.8-e", "MUST NOT", "§28.8", "host-mediated-trust", "The host never exposes credentials/tokens/unrelated context to the sandboxed content."),
  SecurityRequirement("R-28.8-f", "MUST NOT", "§28.8", "host-mediated-trust", "The host never lets sandboxed content exfiltrate host/user state beyond what the policy permits."),
  SecurityRequirement("R-28.8-g", "SHOULD", "§28.8", "host-mediated-trust", "Constrain the sandbox’s network/storage/scripting capabilities to the minimum required."),
  SecurityRequirement("R-28.8-h", "SHOULD", "§28.8", "host-mediated-trust", "Ensure host-rendered consent/identity indicators cannot be spoofed or obscured by the sandbox."),
  # §28.9 metadata & observability
  SecurityRequirement("R-28.9-a", "MUST NOT", "§28.9", "host-mediated-trust", "Never use any metadata value (trace ids, progress tokens) for authentication/authorization/access-control."),
  SecurityRequirement("R-28.9-b", "SHOULD", "§28.9", "host-mediated-trust", "Validate the structure of consumed metadata and ignore values not understood."),
  SecurityRequirement("R-28.9-c", "SHOULD", "§28.9", "data-privacy", "Avoid logging sensitive metadata or recording sensitive request/result content."),
  SecurityRequirement("R-28.9-d", "MUST NOT", "§28.9", "host-mediated-trust", "Credentials and tokens are never logged."),
  SecurityRequirement("R-28.9-e", "SHOULD", "§28.9", "data-privacy", "Minimize and redact observability data that may transit/store outside the trust boundary."),
  # §28.10 input validation & resource bounds
  SecurityRequirement("R-28.10-a", "MUST", "§28.10", "tool-safety", "Validate all inputs accepted from a peer before acting on them."),
  SecurityRequirement("R-28.10-b", "MUST NOT", "§28.10", "tool-safety", "Never assume a peer is well-behaved."),
  SecurityRequirement("R-28.10-c", "MUST", "§28.10", "tool-safety", "A server validates tool-call arguments against the declared input schema before relying on them."),
  SecurityRequirement("R-28.10-d", "SHOULD", "§28.10", "tool-safety", "A client validates structured results against a declared output schema before relying on them."),
  SecurityRequirement("R-28.10-e", "MUST", "§28.10", "tool-safety", "Validation failures are reported as errors rather than acted upon."),
  SecurityRequirement("R-28.10-f", "MUST", "§28.10", "data-privacy", "Validate resource URIs and URI templates before dereferencing or matching them."),
  SecurityRequirement("R-28.10-g", "MUST NOT", "§28.10", "data-privacy", "Never follow a URI to a location the user has not authorized."),
  SecurityRequirement("R-28.10-h", "SHOULD", "§28.10", "data-privacy", "Guard against SSRF where a URI could cause the receiver to issue a network request."),
  SecurityRequirement("R-28.10-i", "MUST", "§28.10", "host-mediated-trust", "A server with an HTTP endpoint validates the Origin header on every connection (DNS-rebinding defense, §9.11)."),
  SecurityRequirement("R-28.10-j", "MUST", "§28.10", "tool-safety", "A server treats a pagination cursor as opaque/untrusted, validates it, and rejects malformed/unknown/expired cursors."),
  SecurityRequirement("R-28.10-k", "MUST", "§28.10", "tool-safety", "Bound resources consumed while validating inputs: schema nesting depth and validation time."),
  SecurityRequirement("R-28.10-l", "SHOULD", "§28.10", "tool-safety", "Impose message/payload size limits and reject inputs that exceed them."),
  SecurityRequirement("R-28.10-m", "MUST NOT", "§28.10", "tool-safety", "Never automatically dereference external schema references in a tool schema."),
  SecurityRequirement("R-28.10-n", "MUST", "§28.10", "tool-safety", "Schemas are self-contained or resolved only against explicitly trusted sources."),
  SecurityRequirement("R-28.10-o", "MUST", "§28.10", "data-privacy", "When serving file:// resources, sanitize file paths to prevent directory traversal."),
  SecurityRequirement("R-28.10-p", "MUST NOT", "§28.10", "data-privacy", "Never serve a file outside the directories the user has authorized."),
)

#: Index over :data:`SECURITY_REQUIREMENTS` by atom id, built once.
_REQUIREMENTS_BY_ID = {r.id: r for r in SECURITY_REQUIREMENTS}


def lookup_security_requirement(id_: str) -> SecurityRequirement | None:
  """Look up a §28 requirement atom by id (e.g. ``"R-28.5-b"``), or ``None``. (R-28-a)"""
  return _REQUIREMENTS_BY_ID.get(id_)


def security_requirements_for_principle(principle: str) -> list[SecurityRequirement]:
  """Return every §28 requirement that derives from a given core principle, in spec
  order — the per-principle slice of the baseline. (R-28.1-a)
  """
  return [r for r in SECURITY_REQUIREMENTS if r.principle == principle]


def mandatory_security_requirements() -> list[SecurityRequirement]:
  """Return every MUST / MUST NOT requirement — the hard obligations conformance turns
  on. (R-28-a)
  """
  return [r for r in SECURITY_REQUIREMENTS if r.level in ("MUST", "MUST NOT")]


# ─── §28.1 — Core-principle baseline checklist (R-28.1-a; AC-44.1) ─────────────


@dataclass(frozen=True)
class SecurityBaselineClaims:
  """A host's self-assertion that it addresses each of the four §28.1 core principles,
  the checklist a conformance review asserts against. (§28.1, R-28-a, R-28.1-a;
  AC-44.1) Each boolean reports whether the implementation claims to be designed around
  that principle.
  """

  #: Users explicitly consent to and control all data access/operations. (R-28.1-b/-c)
  user_consent_and_control: bool
  #: A server receives only host-elected context; no transmission without consent. (R-28.1-e/-f)
  data_privacy: bool
  #: Tools are treated as arbitrary code; definitions/annotations are untrusted. (R-28.1-h/-i)
  tool_safety: bool
  #: Trust is mediated and enforced at the host, never delegated to a server. (§28.1(4))
  host_mediated_trust: bool


@dataclass(frozen=True)
class SecurityBaselineAssessment:
  """Outcome of :func:`assess_security_baseline`.

  ``ok`` with an empty ``unmet_principles`` on success; otherwise ``ok=False`` with the
  unmet principles, in spec order.
  """

  ok: bool
  unmet_principles: list[str] = field(default_factory=list)


def assess_security_baseline(claims: SecurityBaselineClaims) -> SecurityBaselineAssessment:
  """Assert that an implementation is designed around all four §28.1 core principles.
  (§28.1, R-28-a, R-28.1-a; AC-44.1)

  Returns ``ok=True`` only when every principle is claimed; otherwise lists the unmet
  ones, so a conformance review can fail an implementation that does not demonstrably
  address the baseline. The principles are the foundation from which the rest of §28
  derives, so an unmet principle is a baseline failure, not a warning.
  """
  unmet: list[str] = []
  if not claims.user_consent_and_control:
    unmet.append("user-consent-and-control")
  if not claims.data_privacy:
    unmet.append("data-privacy")
  if not claims.tool_safety:
    unmet.append("tool-safety")
  if not claims.host_mediated_trust:
    unmet.append("host-mediated-trust")
  return SecurityBaselineAssessment(True) if not unmet else SecurityBaselineAssessment(False, unmet_principles=unmet)


# ─── §28.2 — User consent and control (R-28.2-a – R-28.2-g; AC-44.2/3/7) ────────


@dataclass(frozen=True)
class ConsentGrant:
  """A record of the consent a user has explicitly granted for a single operation, the
  host's consent-gate state. (§28.2) Absence of a record is NOT consent (R-28.2-d); the
  scope captured here is what a later operation is compared against for material change
  (R-28.2-e, R-28.2-f).
  """

  #: The operation the user authorized, e.g. a tool name or ``"resource-exposure"``.
  operation: str
  #: An opaque, comparable summary of WHAT was authorized — the data scope and the
  #: action. A materially different value on a later request means fresh consent is
  #: required (R-28.2-e, R-28.2-f). Callers choose a stable serialization.
  scope: str
  #: ``True`` when the user actively, informedly granted it. (R-28.2-b)
  informed: bool = False


@dataclass(frozen=True)
class ConsentRequest:
  """A proposed operation seeking the host's consent gate. (§28.2)"""

  #: The operation being proposed.
  operation: str
  #: The scope summary of the proposed operation, compared against any prior grant.
  scope: str
  #: Whether the user has, for THIS proposal, actively and informedly granted consent.
  #: Silence/absence MUST NOT be passed as ``True`` (R-28.2-d). ``None`` ⇒ no fresh grant.
  user_approved: bool | None = None


@dataclass(frozen=True)
class ConsentDecision:
  """The §28.2 consent-gate decision.

  On success ``allowed=True`` with ``reason`` one of ``"matches-prior-grant"`` /
  ``"freshly-approved"``. On denial ``allowed=False`` with ``reason`` one of
  ``"no-consent"`` / ``"not-informed"`` / ``"material-change"`` / ``"silent-escalation"``
  and a human-readable ``detail``.
  """

  allowed: bool
  reason: str
  detail: str | None = None


def evaluate_consent(request: ConsentRequest, prior_grant: ConsentGrant | None = None) -> ConsentDecision:
  """The host consent gate every operation acting on the user's behalf passes before it
  reaches a server. (§28.2, R-28.2-a/-b/-c/-d/-e/-f; AC-44.2, AC-44.7)

  Allows the operation ONLY when one of:
    - it matches a prior grant for the SAME operation and SAME scope — already
      authorized, no re-prompt needed; or
    - the user freshly, informedly approved THIS proposal (``user_approved is True``).

  Denies, with a reason, when:
    - no prior grant and no fresh approval → ``no-consent``: absence of refusal is never
      consent (R-28.2-d);
    - a fresh approval that is not informed → ``not-informed`` (R-28.2-b);
    - a prior grant exists for the operation but the scope differs materially and there
      is no fresh approval → ``silent-escalation``: the host MUST seek fresh consent and
      MUST NOT silently escalate (R-28.2-e, R-28.2-f).

  The gate never treats a missing ``user_approved`` as approval, so a caller cannot
  accidentally let silence through.
  """
  matches_prior = (
    prior_grant is not None
    and prior_grant.operation == request.operation
    and prior_grant.scope == request.scope
  )
  if matches_prior:
    return ConsentDecision(True, "matches-prior-grant")

  # A prior grant for the same operation but a DIFFERENT scope is a material change: the
  # host MUST seek fresh consent and MUST NOT silently escalate. (R-28.2-e/-f)
  is_escalation = prior_grant is not None and prior_grant.operation == request.operation

  if request.user_approved is not True:
    if is_escalation:
      return ConsentDecision(
        False,
        "silent-escalation",
        detail="the operation differs materially from a prior grant; fresh consent MUST be sought and scope MUST NOT be silently escalated (R-28.2-e, R-28.2-f)",
      )
    return ConsentDecision(
      False,
      "no-consent",
      detail="no prior grant and no explicit approval; absence of refusal is never consent (R-28.2-a, R-28.2-d)",
    )

  # Freshly approved — but consent MUST be informed. (R-28.2-b)
  if request.user_approved is True and len(request.scope) > 0:
    return ConsentDecision(True, "freshly-approved")

  return ConsentDecision(
    False,
    "not-informed",
    detail="consent MUST be informed: the user MUST understand the data/action before authorizing (R-28.2-b)",
  )


def record_consent_grant(request: ConsentRequest) -> ConsentGrant:
  """Build the :class:`ConsentGrant` to persist after a successful, informed approval, so
  a later identical operation matches without re-prompting. (R-28.2-b, R-28.2-f)

  Only call after the user has actively and informedly approved
  (``request.user_approved is True``); the resulting grant records the operation+scope
  that :func:`evaluate_consent` compares against.

  :raises ValueError: when ``request.user_approved`` is not ``True``.
  """
  if request.user_approved is not True:
    raise ValueError("record_consent_grant requires user_approved=True (R-28.2-d)")
  return ConsentGrant(operation=request.operation, scope=request.scope, informed=True)


# ─── §28.3 — Tool safety: trust classification & rate limiting ─────────────────

#: The two trust classifications an input may carry. (§28.1, §28.3, R-28.1-i, R-28.3-b)
INPUT_TRUST_VALUES = ("trusted", "untrusted")


def classify_tool_definition_trust(server_is_trusted: bool) -> str:
  """Classify a tool definition's trust: ``"untrusted"`` unless obtained from a server the
  host trusts. (§28.3, R-28.1-i, R-28.3-b; AC-44.6)

  Use the result to gate any reliance on the definition's contents: an ``untrusted``
  definition's descriptions may be adversarial (prompt injection) and its annotations
  carry no authority (:func:`tool_annotation_is_security_guarantee`).
  """
  return "trusted" if server_is_trusted else "untrusted"


def tool_annotation_is_security_guarantee(annotations: dict | None = None) -> bool:
  """Return ``False`` — a tool annotation is NEVER a security guarantee. (§28.3, R-28.3-c;
  AC-44.6)

  A receiver MUST NOT rely on an annotation (e.g. a read-only or non-destructive hint) as
  a security guarantee; such metadata is descriptive, not authoritative, and a malicious
  server may misstate it. This is unconditional and delegates the trust gate to S25's
  :func:`may_trust_tool_annotations`: even when annotations MAY be *displayed* (trusted
  server), they still convey no enforcement authority. ``annotations`` is ignored.
  """
  return False


def may_display_tool_annotations(server_is_trusted: bool) -> bool:
  """Return whether a host MAY surface a tool's annotation hints to the user for THIS
  server — delegating to S25's :func:`may_trust_tool_annotations`. Displaying a hint from
  a trusted server is permitted (R-28.3-b); relying on it as a guarantee is not
  (:func:`tool_annotation_is_security_guarantee`, R-28.3-c). (§28.3; AC-44.6)
  """
  return may_trust_tool_annotations(server_is_trusted)


@dataclass(frozen=True)
class HumanInTheLoopValidation:
  """Outcome of :func:`assert_human_in_the_loop`."""

  ok: bool
  reason: str | None = None


def assert_human_in_the_loop(
  *, user_could_review_and_deny: bool, model_decided_alone: bool
) -> HumanInTheLoopValidation:
  """Assert the human-in-the-loop invariant for a proposed tool invocation: the user could
  review and understand it and the decision did not rest solely with the model. (§28.3,
  R-28.3-d, R-28.3-e; AC-44.8)

  Returns ``ok=False`` when the user was not given the opportunity to review/deny, or
  when the model alone drove the invocation with no human gate — both of which MUST NOT
  happen. This is the backstop that prevents prompt-injection-induced requests from
  executing without review (R-28.3-f).

  :param user_could_review_and_deny: The user was able to review, understand, and deny the
    invocation before it ran. (R-28.3-d)
  :param model_decided_alone: The invocation decision rested solely with the model, with
    no human gate. (R-28.3-e)
  """
  if model_decided_alone:
    return HumanInTheLoopValidation(False, reason="the decision to invoke a tool MUST NOT rest solely with the model (R-28.3-e)")
  if not user_could_review_and_deny:
    return HumanInTheLoopValidation(False, reason="a user MUST be able to review, understand, and deny a proposed tool invocation before it runs (R-28.3-d)")
  return HumanInTheLoopValidation(True)


#: The JSON-RPC error code a rate-limited or invalid-request rejection carries.
#: (§28.3 wire example)
RATE_LIMIT_REJECTION_CODE = -32600


def build_rate_limit_rejection(retry_after_ms: int | None = None, message: str | None = None) -> dict:
  """Build the ``-32600`` rate-limit rejection error a server returns for a ``tools/call``
  that exceeds the limit, matching the §28.3 wire example. (§28.3, R-28.3-h; AC-44.9)

  :param retry_after_ms: OPTIONAL hint for when the client may retry.
  :param message: OPTIONAL override for the error message.
  """
  error: dict = {
    "code": RATE_LIMIT_REJECTION_CODE,
    "message": message or "Rate limit exceeded for tools/call",
  }
  if retry_after_ms is not None:
    error["data"] = {"retryAfterMs": retry_after_ms}
  return error


@dataclass(frozen=True)
class RateLimitDecision:
  """Outcome of :meth:`ToolCallRateLimiter.check`.

  ``allowed=True`` when the call is within the limit; otherwise ``allowed=False`` with
  the ``retry_after_ms`` back-off hint.
  """

  allowed: bool
  retry_after_ms: int = 0


class ToolCallRateLimiter:
  """A sliding-window rate limiter a server applies to ``tools/call`` so a hostile or
  malfunctioning client cannot drive unbounded execution or downstream load. (§28.3,
  R-28.3-g, R-28.3-h; AC-44.9)

  :meth:`check` returns whether a call is within the limit; a server MUST reject (not
  execute) any call that exceeds it (R-28.3-h) — use :func:`build_rate_limit_rejection`
  to build the ``-32600`` error. The window is keyed by an opaque caller-chosen
  client/session id so per-peer limits are independent. Time is injectable for testing.
  """

  def __init__(self, *, max_in_window: int, window_ms: int, now=None) -> None:
    """:param max_in_window: The maximum permitted ``tools/call`` invocations per window
      per key; MUST be a positive integer. (R-28.3-g)
    :param window_ms: The sliding-window length in milliseconds; MUST be positive.
    :param now: OPTIONAL clock (epoch ms); defaults to a monotonic-ish millisecond clock.
    :raises ValueError: When ``max_in_window``/``window_ms`` are not positive.
    """
    if not isinstance(max_in_window, int) or isinstance(max_in_window, bool) or max_in_window < 1:
      raise ValueError("max_in_window MUST be a positive integer (R-28.3-g)")
    if not (window_ms > 0):
      raise ValueError("window_ms MUST be positive (R-28.3-g)")
    self._max_in_window = max_in_window
    self._window_ms = window_ms
    self._now = now if now is not None else _default_now
    self._hits: dict[str, list[int]] = {}

  def _pruned(self, key: str, now: int) -> list[int]:
    cutoff = now - self._window_ms
    kept = [t for t in self._hits.get(key, []) if t > cutoff]
    self._hits[key] = kept
    return kept

  def check(self, key: str) -> RateLimitDecision:
    """Record and evaluate one ``tools/call`` for ``key``. Returns ``allowed=True`` when the
    call is within the limit, or ``allowed=False`` with ``retry_after_ms`` when it exceeds
    it and MUST be rejected rather than executed (R-28.3-h). A rejected call is NOT counted
    toward the window, so a flood cannot extend the back-off indefinitely.

    :param key: An opaque client/session identifier.
    """
    now = self._now()
    recent = self._pruned(key, now)
    if len(recent) >= self._max_in_window:
      oldest = recent[0]
      retry_after_ms = max(0, oldest + self._window_ms - now)
      return RateLimitDecision(False, retry_after_ms=retry_after_ms)
    recent.append(now)
    self._hits[key] = recent
    return RateLimitDecision(True)


def _default_now() -> int:
  """The default millisecond epoch clock used by the limiter / continuation store."""
  return int(time.time() * 1000)


#: C0/C1 control characters a sanitized tool output MUST NOT carry, EXCLUDING the ordinary
#: whitespace ``\t`` (0x09), ``\n`` (0x0a), ``\r`` (0x0d). Covers the ANSI/escape (0x1b)
#: and other control sequences a malicious tool could smuggle. (R-28.3-i)
_CONTROL_SEQUENCE_RE = re.compile("[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]")


def sanitize_tool_output_text(text: str) -> str:
  """Sanitize a tool-output text string so a result cannot carry control sequences that
  would compromise the client, model, or downstream consumers. (§28.3, R-28.3-i; AC-44.9)

  Strips C0/C1 control characters (excluding the ordinary whitespace ``\\t``, ``\\n``,
  ``\\r``) — the ANSI/escape and other control sequences a malicious tool could smuggle
  into a result. It is a content-level guard: structural sanitization of markup/injected
  instructions remains the host's responsibility per its render target, but stripping
  control sequences here removes the lowest-level vector.
  """
  return _CONTROL_SEQUENCE_RE.sub("", text)


def tool_output_has_control_sequences(text: str) -> bool:
  """Return ``True`` when ``text`` contains a control sequence a sanitized output MUST NOT
  carry. (R-28.3-i)
  """
  return _CONTROL_SEQUENCE_RE.search(text) is not None


# ─── §28.4 — Data privacy and isolation (R-28.4-a – R-28.4-f; AC-44.11) ─────────


@dataclass(frozen=True)
class ServerIsolationValidation:
  """Outcome of :func:`assert_server_isolation`."""

  ok: bool
  reason: str | None = None


def assert_server_isolation(
  *, destination_server_id: str, host_elected: bool, source_server_id: str | None = None
) -> ServerIsolationValidation:
  """Assert the §28.4 server-isolation invariant for a flow the host is about to perform: a
  server receives only host-elected context, never another server's
  requests/results/context/credentials. (§28.4, R-28.4-a, R-28.4-d, R-28.4-e, R-28.4-f;
  AC-44.11)

  Returns ``ok=False`` when the destination server is not the one the context originated
  from (cross-server relay) or when the context was not host-elected — both of which the
  host MUST NOT do. One server can never observe another's data (R-28.4-e); the host is
  the only boundary and never bridges two servers.

  :param source_server_id: The server the context/credential came from, if any.
  :param destination_server_id: The server the host is about to send it to.
  :param host_elected: ``True`` when the host deliberately elected to share this context
    with the destination (R-28.4-a).
  """
  if source_server_id is not None and source_server_id != destination_server_id:
    return ServerIsolationValidation(
      False,
      reason=f'the host MUST NOT relay server "{source_server_id}"\'s data/credentials to a different server "{destination_server_id}" (R-28.4-e, R-28.4-f)',
    )
  if not host_elected:
    return ServerIsolationValidation(
      False,
      reason="a server MUST receive only the context the host elects to share with it (R-28.4-a)",
    )
  return ServerIsolationValidation(True)


@dataclass(frozen=True)
class DataExposureValidation:
  """Outcome of :func:`assert_consented_data_exposure`."""

  ok: bool
  reason: str | None = None


def assert_consented_data_exposure(
  *, scope: str, prior_grant: ConsentGrant | None = None, user_approved: bool | None = None
) -> DataExposureValidation:
  """Assert that user/resource data is exposed to a server (or onward) ONLY with the user's
  consent. (§28.4, R-28.4-b, R-28.1-e, R-28.1-f; AC-44.3, AC-44.11)

  Returns ``ok=False`` when the exposure carries user data without an explicit, matching
  consent grant — the host MUST NOT transmit resource data without consent. Wraps
  :func:`evaluate_consent` with the ``"resource-exposure"`` operation, so data-exposure
  consent rides the same gate as tool-invocation consent.

  :param scope: The scope summary of the data being exposed.
  :param prior_grant: Any prior data-exposure consent grant.
  :param user_approved: Whether the user freshly approved this exposure.
  """
  decision = evaluate_consent(
    ConsentRequest(operation="resource-exposure", scope=scope, user_approved=user_approved),
    prior_grant,
  )
  if not decision.allowed:
    return DataExposureValidation(False, reason=f"user data MUST NOT be exposed without consent: {decision.detail}")
  return DataExposureValidation(True)


#: A coarse data-sensitivity class governing the strength of access controls a host
#: SHOULD apply, ordered most-sensitive last so a higher index demands stronger controls.
#: (§28.1, §28.4, R-28.1-g, R-28.4-c; AC-44.4)
DATA_SENSITIVITY_ORDER = ("public", "internal", "confidential", "secret")


def access_controls_are_commensurate(data_sensitivity: str, applied_control: str) -> bool:
  """Return ``True`` when the access controls a host applies are at least as strong as the
  data's sensitivity requires — user data SHOULD be protected with access controls
  commensurate with its sensitivity. (§28.1, §28.4, R-28.1-g, R-28.4-c; AC-44.4)

  Compares the data's sensitivity to the strongest control class the host enforces:
  ``confidential`` data protected only at ``internal`` strength fails. Use to gate
  exposure of sensitive data behind adequate controls.

  :param data_sensitivity: The sensitivity class of the data.
  :param applied_control: The strongest access-control class the host enforces for it.
  """
  return DATA_SENSITIVITY_ORDER.index(applied_control) >= DATA_SENSITIVITY_ORDER.index(data_sensitivity)


# ─── §28.5 — Authorization security (restates §23; R-28.5-a – R-28.5-q) ─────────
#
# PKCE (R-28.5-j/k) and ``state`` (R-28.5-l/m) appear in :data:`SECURITY_REQUIREMENTS`
# above for traceability, but this §28 security-considerations module deliberately ships no
# PKCE/``state`` validator of its own — §28.5 *restates* §23, and the actual mechanism is
# owned by the S36/S37 authorization-flow module: PKCE by
# :func:`mcp.protocol.authorization_flow.create_pkce_challenge` /
# :func:`~mcp.protocol.authorization_flow.verify_pkce` /
# :func:`~mcp.protocol.authorization_flow.confirm_pkce_support`, and ``state`` by
# :func:`~mcp.protocol.authorization_flow.generate_state` /
# :func:`~mcp.protocol.authorization_flow.verify_redirect_state`. The ts-sdk reference makes
# the same split (no validator in its security module). Re-implementing the check here would
# duplicate that enforcement, so the obligation is enumerated, not re-coded.





@dataclass(frozen=True)
class ServerTokenValidation:
  """Outcome of :func:`validate_server_access_token`.

  On rejection ``code`` is :data:`RATE_LIMIT_REJECTION_CODE` (``-32600``).
  """

  ok: bool
  reason: str | None = None
  code: int | None = None


def validate_server_access_token(
  *, token_audience, own_canonical_resource: str, validated_before_use: bool
) -> ServerTokenValidation:
  """Validate, server-side, that a presented access token is audience-bound to THIS server
  and was validated before the request is processed; reject otherwise so no data is
  returned to an unauthorized party. (§28.5, R-28.5-b, R-28.5-c, R-28.5-d, R-28.5-e;
  AC-44.12)

  Delegates the audience check to S37's :func:`validate_token_audience` (which §23 owns)
  and surfaces a ``-32600`` "token not valid for this resource" rejection matching the
  story's wire example. A ``False`` from this MUST stop the request before any data is
  returned (R-28.5-e).

  :param token_audience: The ``aud`` claim the presented token carries (str or list).
    (R-28.5-b)
  :param own_canonical_resource: This server's canonical resource identifier.
  :param validated_before_use: ``True`` when the token was cryptographically validated
    before processing the request (R-28.5-d).
  """
  if not validated_before_use:
    return ServerTokenValidation(
      False,
      reason="a server MUST validate a token before processing the request it accompanies (R-28.5-d)",
      code=RATE_LIMIT_REJECTION_CODE,
    )
  audience = validate_token_audience(token_audience, own_canonical_resource)
  if not audience.ok:
    return ServerTokenValidation(
      False,
      reason=f"token not valid for this resource: {audience.reason} (R-28.5-b, R-28.5-c, R-28.5-e)",
      code=RATE_LIMIT_REJECTION_CODE,
    )
  return ServerTokenValidation(True)


@dataclass(frozen=True)
class TokenPassthroughValidation:
  """Outcome of :func:`assert_no_token_passthrough`."""

  ok: bool
  reason: str | None = None


def assert_no_token_passthrough(
  *,
  client_presented_token: str,
  upstream_token: str,
  upstream_token_issuer: str,
  upstream_authorization_server_issuer: str,
) -> TokenPassthroughValidation:
  """Assert the no-token-passthrough / confused-deputy rule: a server never accepts a token
  issued for another resource and never forwards a client token onward to an upstream
  API; when it calls upstream it uses a SEPARATE token from the upstream AS. (§28.5,
  R-28.5-f, R-28.5-g; AC-44.13)

  Returns ``ok=False`` when the token intended for the upstream call is the same one the
  client presented (``client_presented_token == upstream_token``) — the confused-deputy
  vulnerability — or when the upstream token was not issued by the upstream authorization
  server. Reuses S37's :func:`may_forward_token_to_server` to confirm the upstream
  token's issuer matches the upstream AS.

  :param client_presented_token: The bearer token the client presented to this server.
  :param upstream_token: The token this server intends to send upstream.
  :param upstream_token_issuer: The issuer that minted the upstream token.
  :param upstream_authorization_server_issuer: The upstream API's authorization server
    issuer.
  """
  if upstream_token == client_presented_token:
    return TokenPassthroughValidation(
      False,
      reason="a server MUST NOT forward a client-supplied token onward to an upstream API (confused deputy) (R-28.5-f)",
    )
  if not may_forward_token_to_server(upstream_token_issuer, upstream_authorization_server_issuer):
    return TokenPassthroughValidation(
      False,
      reason="when calling an upstream API a server MUST use a separate token issued by the upstream authorization server (R-28.5-g)",
    )
  return TokenPassthroughValidation(True)


def validate_authorization_issuer(
  *, recorded_issuer: str, iss: str | None = None, iss_parameter_supported: bool | None = None
):
  """Validate the exact-issuer mix-up defense for an authorization response, delegating to
  S37's :func:`validate_exact_issuer` (which §23 owns). The client MUST have recorded the
  expected issuer before redirect and MUST compare any returned issuer by exact string
  comparison, rejecting mismatches. (§28.5, R-28.5-h, R-28.5-i; AC-44.14)

  Returns the sibling validator's result object (carrying ``ok`` and, on failure,
  ``reason``).

  :param iss: The ``iss`` returned in the authorization response, if any.
  :param recorded_issuer: The issuer recorded BEFORE redirect (R-28.5-h).
  :param iss_parameter_supported: The AS
    ``authorization_response_iss_parameter_supported`` flag.
  """
  return validate_exact_issuer(
    iss=iss, recorded_issuer=recorded_issuer, iss_parameter_supported=iss_parameter_supported
  )


@dataclass(frozen=True)
class TokenTransportValidation:
  """Outcome of :func:`assert_token_transport_security`."""

  ok: bool
  reason: str | None = None


def assert_token_transport_security(
  *,
  endpoint_urls,
  token_logged: bool,
  token_forwarded: bool,
  redirect_uris=None,
) -> TokenTransportValidation:
  """Assert the §28.5 token-confidentiality transport rules: tokens are stored securely,
  never logged, never forwarded to a party other than the one they were issued for, and
  authorization-server endpoints and redirect URIs use HTTPS (a ``localhost`` redirect is
  permitted). (§28.5, R-28.5-n, R-28.5-o, R-28.5-p, R-28.5-q, R-28.9-d; AC-44.17)

  A pure policy check over the handling claims and the endpoint/redirect URLs: returns
  the first violation. HTTPS is required for every AS endpoint; a redirect URI may
  additionally be a loopback (``http://localhost`` / ``127.0.0.1``).

  :param endpoint_urls: Authorization-server endpoint URLs (token/authorize/etc.).
    (R-28.5-q)
  :param redirect_uris: The client redirect URIs (loopback http permitted). (R-28.5-q)
  :param token_logged: Whether any token was written to a log/trace (MUST be False).
    (R-28.5-o)
  :param token_forwarded: Whether a token was forwarded to a party other than its
    intended one (MUST be False). (R-28.5-p)
  """
  if token_logged:
    return TokenTransportValidation(False, reason="tokens MUST NOT be logged (R-28.5-o, R-28.9-d)")
  if token_forwarded:
    return TokenTransportValidation(False, reason="tokens MUST NOT be forwarded to any party other than the one they were issued for (R-28.5-p)")
  for url in endpoint_urls:
    if not _is_https_url(url):
      return TokenTransportValidation(False, reason=f'authorization-server endpoint "{url}" MUST use HTTPS (R-28.5-q)')
  for uri in redirect_uris or []:
    if not _is_https_url(uri) and not _is_loopback_http_url(uri):
      return TokenTransportValidation(False, reason=f'redirect URI "{uri}" MUST use HTTPS (a localhost redirect is permitted) (R-28.5-q)')
  return TokenTransportValidation(True)


def _is_https_url(url: str) -> bool:
  """Return ``True`` when ``url`` is a valid ``https:`` URL. (R-28.5-q)"""
  try:
    return urlsplit(url).scheme == "https"
  except ValueError:
    return False


def _is_loopback_http_url(url: str) -> bool:
  """Return ``True`` when ``url`` is an ``http:`` URL whose host is a loopback address.
  (R-28.5-q)
  """
  try:
    parts = urlsplit(url)
  except ValueError:
    return False
  if parts.scheme != "http":
    return False
  host = (parts.hostname or "").lower()
  return host in ("localhost", "127.0.0.1", "::1")


# ─── §28.6 — Multi-round-trip & continuation safety (R-28.6-a – R-28.6-c) ───────


@dataclass
class ContinuationTokenRecord:
  """A server-side handle to continuation state, the §28.6 handling profile for the S17
  ``requestState`` token. (§28.6, R-28.6-a, R-28.6-c) The token a client receives is the
  opaque ``value``; the integrity and binding are server-held so the client cannot read,
  forge, or tamper with the state it represents.
  """

  #: The opaque token value handed to the client.
  value: str
  #: The integrity tag the server uses to detect tampering — a signature/MAC over the
  #: state, or (for an unguessable-handle design) the handle's existence in this store. A
  #: receiver MUST reject a token whose presented tag fails this. (R-28.6-a)
  integrity_tag: str
  #: The server-held continuation state the token stands for.
  state: object
  #: Epoch ms after which the token is expired and replay is refused; ``None`` ⇒ no time
  #: bound. (R-28.6-c)
  expires_at_ms: int | None = None
  #: ``True`` once the token has been consumed, for single-use replay defense. (R-28.6-c)
  consumed: bool = False


@dataclass(frozen=True)
class ContinuationTokenValidation:
  """Outcome of :meth:`ContinuationTokenStore.validate`.

  On success ``ok=True`` with the protected ``state``; on rejection ``ok=False`` with
  ``reason`` one of ``"integrity-failure"`` / ``"expired"`` / ``"replayed"`` /
  ``"unknown"`` and a human-readable ``detail``.
  """

  ok: bool
  state: object = None
  reason: str | None = None
  detail: str | None = None


class ContinuationTokenStore:
  """A server-side store for ``requestState`` continuation tokens that protects their
  integrity and confidentiality and guards against replay, the §28.6 handling profile.
  (§28.6, R-28.6-a, R-28.6-b, R-28.6-c; AC-44.18)

  The client only ever sees the opaque ``value``; the state and integrity tag are held
  entirely server-side (the "unguessable handle" design §28.6 permits). On presentation
  :meth:`validate` rejects — rather than acting on — a token that fails integrity
  (R-28.6-b), is expired, was already consumed (single-use replay defense), or is
  unknown. :meth:`issue` mints a single-use, optionally time-bounded handle.
  """

  def __init__(self, *, now=None, mint=None) -> None:
    """:param now: OPTIONAL clock (epoch ms); defaults to a millisecond epoch clock.
    :param mint: OPTIONAL unguessable-value generator; defaults to a monotonic
      random-ish handle. Inject a CSPRNG-backed generator in production.
    """
    self._by_value: dict[str, ContinuationTokenRecord] = {}
    self._now = now if now is not None else _default_now
    self._counter = 0
    self._mint = mint if mint is not None else self._default_mint

  def _default_mint(self) -> str:
    value = f"rs_{self._counter}_{token_hex(16)}"
    self._counter += 1
    return value

  def issue(self, state: object, *, integrity_tag: str | None = None, ttl_ms: int | None = None) -> ContinuationTokenRecord:
    """Mint a single-use continuation token for ``state``, with an optional integrity tag and
    time bound. The returned ``value`` is the opaque handle to give the client; the state
    never crosses the wire. (R-28.6-a, R-28.6-c)

    :param state: The server-side continuation state to stash.
    :param integrity_tag: OPTIONAL signature/MAC the client must echo for a signed-token
      design; defaults to the handle being its own integrity (unguessable handle).
      (R-28.6-a)
    :param ttl_ms: OPTIONAL time bound; the token expires after this many ms. (R-28.6-c)
    """
    value = self._mint()
    record = ContinuationTokenRecord(
      value=value,
      integrity_tag=integrity_tag if integrity_tag is not None else value,
      state=state,
      expires_at_ms=(self._now() + ttl_ms) if ttl_ms is not None else None,
      consumed=False,
    )
    self._by_value[value] = record
    return record

  def validate(self, value: str, presented_integrity_tag: str | None = None) -> ContinuationTokenValidation:
    """Validate a presented continuation token, returning the protected state on success or a
    structured rejection. A receiver MUST reject (never act on) a token that fails
    integrity (R-28.6-b); replay (expiry or re-use) is refused too (R-28.6-c). A successful
    validation consumes the single-use token.

    :param value: The opaque token value the client presented.
    :param presented_integrity_tag: The integrity tag the client echoed, for a signed
      design; omit for an unguessable-handle design.
    """
    record = self._by_value.get(value)
    if record is None:
      return ContinuationTokenValidation(False, reason="unknown", detail="continuation token is not recognized; reject rather than act on it (R-28.6-b)")
    expected_tag = record.integrity_tag
    actual_tag = presented_integrity_tag if presented_integrity_tag is not None else value
    if actual_tag != expected_tag:
      return ContinuationTokenValidation(False, reason="integrity-failure", detail="continuation token failed integrity validation; reject rather than act on its contents (R-28.6-b)")
    if record.expires_at_ms is not None and self._now() >= record.expires_at_ms:
      del self._by_value[value]
      return ContinuationTokenValidation(False, reason="expired", detail="continuation token has expired; refuse replay (R-28.6-c)")
    if record.consumed is True:
      return ContinuationTokenValidation(False, reason="replayed", detail="continuation token was already used; refuse replay (single-use) (R-28.6-c)")
    record.consumed = True
    return ContinuationTokenValidation(True, state=record.state)


# ─── §28.7 — Elicitation & sampling consent (R-28.7-a – R-28.7-g; AC-44.19/20) ──

#: The terminal user decisions on a server-initiated elicitation. (§28.7, R-28.7-b,
#: R-28.7-c) Mirrors S31's ``ElicitAction`` outcomes; a user MUST be able to reach
#: ``decline``/``cancel`` at any point.
ELICITATION_USER_DECISIONS = ("approve", "edit", "decline", "cancel")


@dataclass(frozen=True)
class ElicitationControlValidation:
  """Outcome of :func:`assert_elicitation_under_user_control`."""

  ok: bool
  reason: str | None = None


_SCHEMA_UNSET = object()


def assert_elicitation_under_user_control(
  *,
  decision: str,
  user_could_review: bool,
  server_identity_shown: bool,
  requested_schema: object = _SCHEMA_UNSET,
) -> ElicitationControlValidation:
  """Assert a server-initiated elicitation remained under user control before anything was
  returned to the server: the user could review and reach an explicit decision
  (approve/edit/decline/cancel), the requesting server's identity was shown, and the
  request did not phish for secrets via form mode. (§28.7, R-28.7-a, R-28.7-b, R-28.7-c,
  R-28.7-d, R-28.7-e; AC-44.19)

  Delegates the form-mode anti-phishing check to S31's :func:`assert_form_mode_may_collect`
  (a server MUST NOT use a form to collect credentials/secrets — that belongs in URL
  mode). Returns the first violation; a ``decline``/``cancel`` decision is always
  permitted (the user may stop at any point) and returns ``ok=True`` without requiring the
  schema to be safe, since nothing is returned to the server.

  :param decision: The user's terminal decision (R-28.7-b, R-28.7-c).
  :param user_could_review: The user was able to review the request before deciding
    (R-28.7-b).
  :param server_identity_shown: The requesting server's identity was made clear
    (R-28.7-e).
  :param requested_schema: The form-mode requestedSchema, checked for secret-phishing
    (R-28.7-d). Omit when there is no form schema.
  """
  if not user_could_review:
    return ElicitationControlValidation(False, reason="the user MUST be able to review an elicitation request before responding (R-28.7-b)")
  # Declining/cancelling is always available; nothing is returned to the server.
  if decision in ("decline", "cancel"):
    return ElicitationControlValidation(True)
  if not server_identity_shown:
    return ElicitationControlValidation(False, reason="the requesting server’s identity SHOULD be made clear in the elicitation interface (R-28.7-e)")
  if requested_schema is not _SCHEMA_UNSET:
    safe = assert_form_mode_may_collect(requested_schema)
    if not safe.ok:
      fields = ", ".join(safe.sensitive_fields)
      return ElicitationControlValidation(
        False,
        reason=f"a server MUST NOT use elicitation to phish for secrets; sensitive fields [{fields}] MUST use URL mode (R-28.7-d)",
      )
  return ElicitationControlValidation(True)


@dataclass(frozen=True)
class SamplingControlValidation:
  """Outcome of :func:`assert_sampling_under_user_control`."""

  ok: bool
  reason: str | None = None


def assert_sampling_under_user_control(
  *,
  obligations: SamplingConsentObligations,
  prompt_reviewed: bool,
  completion_reviewed: bool,
  disclosed_context_within_authorization: bool,
) -> SamplingControlValidation:
  """Assert a server-driven sampling flow remained under user control: the MUST-level §28.7
  obligations are met (human review of prompt and completion before they are acted upon
  or transmitted) and the host disclosed no more conversation context than the user
  authorized. (§28.7, R-28.7-a, R-28.7-f, R-28.7-g; AC-44.20)

  Reuses S33's :func:`unmet_required_consent_obligations` for the human-in-the-loop /
  user-may-deny / sensitive-data MUSTs, and additionally requires the prompt and
  completion to have been human-reviewed (R-28.7-f) and the disclosed context to be
  within the user's authorization (R-28.7-g).

  :param obligations: The host's §21.2.10 consent-obligation claims (S33). (R-28.7-a)
  :param prompt_reviewed: The prompt sent to the model was human-reviewed/approved.
    (R-28.7-f)
  :param completion_reviewed: The completion was human-reviewed before being acted upon.
    (R-28.7-f)
  :param disclosed_context_within_authorization: The disclosed conversation context was
    within what the user authorized. (R-28.7-g)
  """
  unmet = unmet_required_consent_obligations(obligations)
  if unmet:
    return SamplingControlValidation(False, reason=f"sampling MUST remain under user control; unmet obligations: {', '.join(unmet)} (R-28.7-a)")
  if not prompt_reviewed or not completion_reviewed:
    return SamplingControlValidation(False, reason="sampling prompts and completions MUST be subject to human review before being acted upon or transmitted (R-28.7-f)")
  if not disclosed_context_within_authorization:
    return SamplingControlValidation(False, reason="the host MUST NOT disclose more conversation context to a sampling request than the user authorized (R-28.7-g)")
  return SamplingControlValidation(True)


# ─── §28.8 — UI sandboxing (R-28.8-a – R-28.8-h; AC-44.21/22) ───────────────────


@dataclass(frozen=True)
class UiSandboxValidation:
  """Outcome of :func:`assert_ui_sandbox_conforming`."""

  ok: bool
  reason: str | None = None


def assert_ui_sandbox_conforming(
  *, sandbox_denied_access, restrictive_csp_applied: bool, exposed_to_ui: dict
) -> UiSandboxValidation:
  """Assert a server-provided UI is rendered conformingly: it runs in an isolated sandbox
  that denies DOM/cookies/storage/navigation, under a restrictive CSP, and exposes no
  credentials/tokens/unrelated context. (§28.8, R-28.8-a, R-28.8-e, R-28.8-f, R-28.8-g;
  AC-44.21, AC-44.22)

  Reuses S42's :func:`sandbox_isolation_is_conforming` (the deny-everything isolation
  model) and :func:`ui_exposure_is_clean` (the allow-list exposure check). A missing CSP,
  an incomplete sandbox, or a dirty exposure each fails.

  :param sandbox_denied_access: The categories the sandbox denies (S42). (R-28.8-a)
  :param restrictive_csp_applied: Whether a restrictive content-security policy is
    applied. (R-28.8-a)
  :param exposed_to_ui: The data the host hands to the UI, exposure-checked (S42).
    (R-28.8-e)
  """
  if not restrictive_csp_applied:
    return UiSandboxValidation(False, reason="server-provided UI MUST be rendered under a restrictive content-security policy (R-28.8-a)")
  if not sandbox_isolation_is_conforming(sandbox_denied_access):
    return UiSandboxValidation(False, reason="the UI sandbox MUST deny DOM/cookies/storage/navigation so it cannot exfiltrate host/user state (R-28.8-a, R-28.8-f)")
  if not ui_exposure_is_clean(exposed_to_ui):
    return UiSandboxValidation(False, reason="the host MUST NOT expose credentials/tokens/unrelated context to the sandboxed UI (R-28.8-e)")
  return UiSandboxValidation(True)


def mediate_ui_initiated_tool_call(ui_input):
  """Mediate a UI-requested ``tools/call``, routing it through the host's normal consent /
  human-in-the-loop path; the UI can never cause a tool to run without host mediation and
  user consent. (§28.8, R-28.8-b, R-28.8-c, R-28.8-d; AC-44.21)

  A thin restatement under the §28.8 atoms of S42's :func:`mediate_ui_tools_call` — the
  same gate that enforces visibility, host policy, and user consent before a UI-originated
  call reaches a server. A ``route=False`` decision MUST be answered with a §22 error,
  never a silent execution. Returns the sibling decision (carrying ``route``) verbatim.

  :param ui_input: The UI tool-call mediation input (S42).
  """
  return mediate_ui_tools_call(ui_input)


# ─── §28.9 — Metadata & observability (R-28.9-a – R-28.9-e; AC-44.23) ───────────


def metadata_conveys_authority(key: str | None = None) -> bool:
  """Return ``False`` — metadata MUST NOT be a source of authority. (§28.9, R-28.9-a;
  AC-44.23)

  Trace identifiers, progress tokens, and similar fields MUST NOT be used for
  authentication, authorization, or any access-control decision; a peer can set them to
  arbitrary values. This is unconditional, so a caller cannot accidentally derive
  authority from a metadata field. ``key`` is ignored.
  """
  return False


#: Keys whose values are credentials/tokens and MUST NOT be logged or recorded.
#: (R-28.9-c, R-28.9-d)
_SENSITIVE_LOG_KEYS = (
  "authorization",
  "token",
  "access_token",
  "accesstoken",
  "refresh_token",
  "refreshtoken",
  "id_token",
  "secret",
  "client_secret",
  "password",
  "api_key",
  "apikey",
  "cookie",
  "set-cookie",
)


def _is_sensitive_log_key(key: str) -> bool:
  """Return ``True`` when a metadata/log key names a credential/token that MUST NOT be
  logged. (R-28.9-d)
  """
  k = key.lower()
  return any(k == s or s in k for s in _SENSITIVE_LOG_KEYS)


#: The placeholder substituted for a redacted credential/token value. (R-28.9-d, R-28.9-e)
REDACTED_PLACEHOLDER = "[REDACTED]"


def redact_for_logging(value: object) -> object:
  """Return a copy of an object intended for a log/trace/telemetry sink with
  credential/token values redacted, so credentials and tokens are never logged and data
  crossing the trust boundary is minimized. (§28.9, R-28.9-c, R-28.9-d, R-28.9-e;
  AC-44.23, AC-44.17)

  Walks the object recursively; any property whose key names a credential/token (see
  :data:`_SENSITIVE_LOG_KEYS`) has its value replaced with :data:`REDACTED_PLACEHOLDER`,
  regardless of the value's type. The input is never mutated. Use at every logging
  boundary so an accidental log of a request/metadata object cannot leak a secret.
  """
  if isinstance(value, list):
    return [redact_for_logging(v) for v in value]
  if isinstance(value, dict):
    out: dict = {}
    for key, v in value.items():
      out[key] = REDACTED_PLACEHOLDER if isinstance(key, str) and _is_sensitive_log_key(key) else redact_for_logging(v)
    return out
  return value


def sanitize_consumed_metadata(metadata: object, known) -> dict:
  """Validate the structure of consumed metadata, returning only the entries the receiver
  understands and ignoring the rest. (§28.9, R-28.9-b; AC-44.23)

  Receivers SHOULD validate metadata structure and ignore values they do not understand;
  this keeps only keys in ``known`` (and only when the value is present, i.e. not
  ``None``), so an unknown or malformed extra field is dropped rather than acted upon. It
  never raises on a malformed input — a non-mapping yields ``{}``.

  :param metadata: The raw metadata object from a peer.
  :param known: The metadata keys this receiver understands.
  """
  out: dict = {}
  if not isinstance(metadata, dict):
    return out
  known_set = set(known)
  for key, value in metadata.items():
    if key in known_set and value is not None:
      out[key] = value
  return out


# ─── §28.10 — Input validation & resource bounds (R-28.10-a – R-28.10-p) ────────

#: The JSON-RPC error code a validation/cursor/argument failure is reported with. (§28.10)
VALIDATION_ERROR_CODE = -32602


@dataclass(frozen=True)
class PeerToolCallValidation:
  """Outcome of :func:`validate_peer_tool_call`.

  On failure ``code`` is :data:`VALIDATION_ERROR_CODE` (``-32602``), ``message`` names the
  failing stage, and ``errors`` carries the schema-validation messages.
  """

  ok: bool
  code: int | None = None
  message: str | None = None
  errors: list[str] = field(default_factory=list)


def validate_peer_tool_call(*, tool: dict, args: object, structured_result: object = _SCHEMA_UNSET) -> PeerToolCallValidation:
  """Validate ``tools/call`` arguments against a tool's declared input schema and,
  optionally, structured results against an output schema, reporting a failure as a
  ``-32602`` error rather than acting on the input. (§28.10, R-28.10-a, R-28.10-b,
  R-28.10-c, R-28.10-d, R-28.10-e; AC-44.24)

  Delegates to S25's :func:`validate_tool_arguments` / :func:`validate_tool_structured_content`;
  on failure returns a structured error (matching the story's wire example) so the caller
  reports it rather than executing the call — a receiver MUST validate all peer inputs
  first and MUST NOT assume a peer is well-behaved.

  :param tool: The tool definition carrying ``inputSchema`` (and optional ``outputSchema``).
  :param args: The ``arguments`` object to validate. (R-28.10-c)
  :param structured_result: OPTIONAL structured result to validate against the output
    schema. (R-28.10-d)
  """
  arg_check = validate_tool_arguments(tool, args)
  if not arg_check.valid:
    return PeerToolCallValidation(
      False,
      code=VALIDATION_ERROR_CODE,
      message="Tool arguments failed input-schema validation",
      errors=list(arg_check.errors),
    )
  if structured_result is not _SCHEMA_UNSET and tool.get("outputSchema") is not None:
    result_check = validate_tool_structured_content(tool, structured_result)
    if not result_check.valid:
      return PeerToolCallValidation(
        False,
        code=VALIDATION_ERROR_CODE,
        message="Structured result failed output-schema validation",
        errors=list(result_check.errors),
      )
  return PeerToolCallValidation(True)


@dataclass(frozen=True)
class ResourceUriValidation:
  """Outcome of :func:`validate_resource_uri_access`."""

  ok: bool
  reason: str | None = None


def validate_resource_uri_access(uri: str, *, is_authorized_location, guard_ssrf: bool = False) -> ResourceUriValidation:
  """Validate a resource URI before dereferencing or matching it: it parses as an absolute
  URI, its location is one the user has authorized, and (when it could trigger a network
  request) it is not an SSRF target. (§28.10, R-28.10-f, R-28.10-g, R-28.10-h; AC-44.25)

  Returns the first violation. Authorization is delegated to a caller-supplied predicate
  over the parsed URL (the host owns the authorized-location policy); the SSRF guard
  rejects a URL whose host resolves to a private/loopback/link-local address when
  ``guard_ssrf`` is set, since the receiver MUST NOT be driven to fetch an internal
  location.

  :param uri: The resource URI to validate. (R-28.10-f)
  :param is_authorized_location: Predicate ``(parsed_url) -> bool``: is this URL a location
    the user authorized? (R-28.10-g)
  :param guard_ssrf: When ``True``, reject private/loopback/link-local hosts. (R-28.10-h)
  """
  parts = urlsplit(uri)
  # An absolute URI requires a scheme (the WHATWG ``URL`` constructor the TS uses rejects
  # a bare token like ``"not a uri"`` for exactly this reason).
  if not parts.scheme:
    return ResourceUriValidation(False, reason="resource URI MUST be a valid absolute URI before it is dereferenced or matched (R-28.10-f)")
  if not is_authorized_location(parts):
    return ResourceUriValidation(False, reason="a receiver MUST NOT follow a URI to a location the user has not authorized (R-28.10-g)")
  if guard_ssrf and _is_likely_ssrf_target(parts):
    return ResourceUriValidation(False, reason="the URI resolves to a private/loopback/link-local host; guard against SSRF (R-28.10-h)")
  return ResourceUriValidation(True)


_IPV4_RE = re.compile(r"^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$")


def _is_likely_ssrf_target(parts) -> bool:
  """Return ``True`` when a URL's host is a private/loopback/link-local literal (an SSRF
  risk). (R-28.10-h)
  """
  host = (parts.hostname or "").lower()
  if host == "localhost" or host.endswith(".localhost"):
    return True
  if host in ("::1",):
    return True
  m = _IPV4_RE.match(host)
  if m:
    a, b = int(m.group(1)), int(m.group(2))
    if a == 127:  # loopback
      return True
    if a == 10:  # private
      return True
    if a == 192 and b == 168:  # private
      return True
    if a == 172 and 16 <= b <= 31:  # private
      return True
    if a == 169 and b == 254:  # link-local
      return True
    if a == 0:  # "this host"
      return True
  # IPv6 unique-local (fc00::/7) and link-local (fe80::/10) literals. ``urlsplit`` strips
  # the brackets the TS form matches on (``[fc``/``[fe8``/…), so we instead key off the
  # ``:`` that only an IPv6 literal carries — never a regular ``fc.example.com`` hostname.
  if ":" in host and host.startswith(("fc", "fd", "fe8", "fe9", "fea", "feb")):
    return True
  return False


@dataclass(frozen=True)
class RequestOriginValidation:
  """Outcome of :func:`validate_request_origin`.

  ``accepted=True`` when the Origin is absent or in the accepted set; otherwise
  ``accepted=False`` with the rejected ``origin``.
  """

  accepted: bool
  origin: str | None = None


def validate_request_origin(origin: str | None, accepted_origins) -> RequestOriginValidation:
  """Validate an ``Origin`` header against the server's accepted-origin set on every incoming
  HTTP connection, rejecting untrusted origins to defend against DNS-rebinding — the
  §28.10-i restatement of the §9.11 rule. (§28.10, R-28.10-i; AC-44.26)

  Returns ``accepted=False`` when the ``Origin`` header is present and not in the accepted
  set (the request MUST be rejected); an absent ``Origin`` or one in the set passes,
  matching exactly. §9.11 (S15) owns the rule in full and the transport layer's
  ``validate_origin``; this is the protocol-level predicate §28.10 references so a
  server's request pipeline can assert it.

  :param origin: The request's ``Origin`` header value, or ``None``.
  :param accepted_origins: The origins the server is configured to accept.
  """
  if origin is None:
    return RequestOriginValidation(True)
  allow = accepted_origins if isinstance(accepted_origins, (set, frozenset)) else set(accepted_origins)
  return RequestOriginValidation(True) if origin in allow else RequestOriginValidation(False, origin=origin)


@dataclass(frozen=True)
class CursorValidation:
  """Outcome of :func:`validate_pagination_cursor`.

  On success ``ok=True`` with the validated ``cursor`` (which may be ``None`` for the
  first page); on rejection ``ok=False`` with the S18 ``-32602`` ``error`` dict.
  """

  ok: bool
  cursor: str | None = None
  error: dict | None = None


def validate_pagination_cursor(cursor: str | None, *, is_known) -> CursorValidation:
  """Validate a pagination cursor as opaque, untrusted input: it is rejected with a
  ``-32602`` error when malformed, unknown, or expired, rather than having its
  attacker-controlled contents interpreted. (§28.10, R-28.10-j; AC-44.27)

  A server MUST treat a cursor as opaque and MUST NOT decode and act on its contents. The
  ``is_known`` predicate is the server's own recognition check (e.g. "did I mint this
  cursor and is it unexpired?"); a non-string or unrecognized cursor yields S18's
  :func:`build_invalid_cursor_error` (``-32602``). An absent cursor is valid — it requests
  the first page.

  :param cursor: The cursor the client supplied, or ``None`` for the first page.
  :param is_known: Predicate ``(cursor) -> bool``: did this server issue this cursor and is
    it still valid?
  """
  if cursor is None:
    return CursorValidation(True, cursor=None)
  if not isinstance(cursor, str) or not is_known(cursor):
    return CursorValidation(False, error=build_invalid_cursor_error("Invalid cursor: malformed, unknown, or expired"))
  return CursorValidation(True, cursor=cursor)


@dataclass(frozen=True)
class InputBounds:
  """Resource bounds a receiver imposes while validating peer inputs. (§28.10, R-28.10-k,
  R-28.10-l)
  """

  #: Maximum schema nesting depth; deeper schemas are rejected. (R-28.10-k)
  max_schema_depth: int
  #: Maximum serialized payload size in bytes; larger inputs are rejected. (R-28.10-l)
  max_payload_bytes: int


#: Default input bounds, derived from S25's :data:`DEFAULT_SCHEMA_LIMITS` for schema depth
#: plus a conservative payload-size cap. (§28.10, R-28.10-k, R-28.10-l)
DEFAULT_INPUT_BOUNDS = InputBounds(max_schema_depth=DEFAULT_SCHEMA_LIMITS.max_depth, max_payload_bytes=4 * 1024 * 1024)


@dataclass(frozen=True)
class InputBoundsValidation:
  """Outcome of :func:`enforce_input_bounds`."""

  ok: bool
  reason: str | None = None


def enforce_input_bounds(
  *, schema: object = _SCHEMA_UNSET, serialized_payload: str | None = None, bounds: InputBounds | None = None
) -> InputBoundsValidation:
  """Bound the resources consumed while validating a peer input: reject a schema whose
  nesting depth exceeds the limit (reusing S25's :func:`schema_nesting_depth`, which
  itself caps recursion) and a payload exceeding the size limit. (§28.10, R-28.10-k,
  R-28.10-l; AC-44.28)

  A receiver MUST bound schema nesting depth (R-28.10-k); the depth probe stops at the cap
  so a pathological self-referential schema cannot exhaust the stack while being measured.
  The payload-size check uses the UTF-8 byte length of the serialized payload, when
  supplied.

  :param schema: The schema to depth-bound. (R-28.10-k)
  :param serialized_payload: OPTIONAL serialized payload whose size is bounded. (R-28.10-l)
  :param bounds: The bounds to enforce; defaults to :data:`DEFAULT_INPUT_BOUNDS`.
  """
  bounds = bounds if bounds is not None else DEFAULT_INPUT_BOUNDS
  if schema is not _SCHEMA_UNSET:
    depth = schema_nesting_depth(schema, bounds.max_schema_depth + 1)
    if depth > bounds.max_schema_depth:
      return InputBoundsValidation(False, reason=f"schema nesting depth exceeds the bound {bounds.max_schema_depth} (R-28.10-k)")
  if serialized_payload is not None:
    num_bytes = len(serialized_payload.encode("utf-8"))
    if num_bytes > bounds.max_payload_bytes:
      return InputBoundsValidation(False, reason=f"payload size {num_bytes}B exceeds the bound {bounds.max_payload_bytes}B (R-28.10-l)")
  return InputBoundsValidation(True)


@dataclass(frozen=True)
class SchemaSelfContainmentValidation:
  """Outcome of :func:`assert_self_contained_schema`."""

  ok: bool
  reason: str | None = None


def assert_self_contained_schema(
  schema: object, *, allow_trusted_external_refs: bool = False, max_depth: int | None = None
) -> SchemaSelfContainmentValidation:
  """Assert a tool schema is self-contained — it carries no external ``$ref`` that the
  server would have to dereference — unless external resolution is explicitly permitted
  against a trusted source. (§28.10, R-28.10-m, R-28.10-n; AC-44.29)

  Reuses S25's :func:`has_external_ref`, a pure structural inspection that performs no I/O,
  so it can never trigger the SSRF fetch it guards against. A server MUST NOT
  automatically dereference external references; when ``allow_trusted_external_refs`` is
  not set (the default), any external ``$ref``/``$dynamicRef`` fails.

  :param schema: The tool schema to inspect. (R-28.10-m)
  :param allow_trusted_external_refs: Opt-in: external refs are resolved only against
    explicitly trusted sources. (R-28.10-n) Defaults to ``False``.
  :param max_depth: Recursion bound for the inspection; defaults to the schema limit.
  """
  if allow_trusted_external_refs:
    return SchemaSelfContainmentValidation(True)
  max_depth = max_depth if max_depth is not None else DEFAULT_SCHEMA_LIMITS.max_depth
  if has_external_ref(schema, max_depth):
    return SchemaSelfContainmentValidation(
      False,
      reason="a server MUST NOT automatically dereference external schema references; schemas MUST be self-contained or resolved only against trusted sources (R-28.10-m, R-28.10-n)",
    )
  return SchemaSelfContainmentValidation(True)


@dataclass(frozen=True)
class FilePathValidation:
  """Outcome of :func:`sanitize_file_path`.

  On success ``ok=True`` with the normalized ``resolved_path``; on rejection ``ok=False``
  with ``reason``.
  """

  ok: bool
  resolved_path: str | None = None
  reason: str | None = None


def sanitize_file_path(requested_path: str, authorized_root: str) -> FilePathValidation:
  """Sanitize a requested ``file://`` resource path against an authorized root, rejecting
  directory-traversal and any path that escapes the root. (§28.10, R-28.10-o, R-28.10-p;
  AC-44.30)

  A server MUST sanitize file paths to prevent directory traversal (e.g. ``..`` segments)
  and MUST NOT serve a file outside the authorized directories. The check is purely lexical
  (no filesystem I/O): it normalizes ``.``/``..`` segments POSIX-style and confirms the
  result stays within ``authorized_root``. A path that normalizes to outside the root —
  via ``..`` or an absolute escape — is rejected.

  :param requested_path: The requested file path (relative to, or under, the root).
    (R-28.10-o)
  :param authorized_root: The absolute root directory the user has authorized. (R-28.10-p)
  """
  if "\x00" in requested_path:
    return FilePathValidation(False, reason="file path MUST NOT contain a NUL byte (R-28.10-o)")
  root = _normalize_posix(authorized_root)
  # Resolve the requested path against the root, then normalize away `.`/`..`.
  joined = _normalize_posix(requested_path) if requested_path.startswith("/") else _normalize_posix(f"{root}/{requested_path}")
  root_with_slash = root if root.endswith("/") else f"{root}/"
  if joined != root and not joined.startswith(root_with_slash):
    return FilePathValidation(
      False,
      reason=f'resolved path "{joined}" escapes the authorized root "{root}"; reject directory traversal (R-28.10-o, R-28.10-p)',
    )
  return FilePathValidation(True, resolved_path=joined)


def _normalize_posix(path: str) -> str:
  """Normalize a POSIX-style path, collapsing ``.``/``..``/duplicate-slash segments. Lexical
  only.
  """
  is_absolute = path.startswith("/")
  segments: list[str] = []
  for seg in path.split("/"):
    if seg == "" or seg == ".":
      continue
    if seg == "..":
      if segments and segments[-1] != "..":
        segments.pop()
      elif not is_absolute:
        segments.append("..")
      # For an absolute path, `..` above the root is clamped at the root.
      continue
    segments.append(seg)
  body = "/".join(segments)
  return f"/{body}" if is_absolute else body
