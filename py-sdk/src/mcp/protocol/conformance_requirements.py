"""S45 — Conformance Requirements & References (§29–§30).

The formal conformance contract: the precise, testable definition of what it means
for an MCP implementation to be conformant, decomposed along the three independent
axes of §29.1 — **role** (client / server / both), **feature surface** (baseline
plus whatever is advertised), and **transport** (each transport implemented,
independently). It restates, as a single machine-checkable rulebook, the baseline
obligations of every server and every client (§29.2, §29.3), the bidirectional
advertise⇔implement principle for capabilities and extensions (§29.4, §29.5), the
robustness rules for richer-than-understood inputs (§29.6), the stateless-model
invariants (§29.7), the transport obligations (§29.8), the method for determining
conformance (§29.9), and the provenance-only status of the §30 reference markers.

This is a conceptual, cross-cutting story: it defines NO new wire types. Its
artifacts are a registry of normative requirements (:data:`CONFORMANCE_REQUIREMENTS`),
a requirement-level classifier (:func:`classify_requirement_level`), the abstract
:class:`ConformanceProfile` descriptor and its validator
(:func:`validate_conformance_profile`), the baseline server request-disposition
predicate (:func:`classify_server_request`), the capability→obligation map
(:data:`CAPABILITY_OBLIGATIONS`), the robustness disposition
(:func:`robustness_disposition`), the stateless invariants
(:data:`STATELESS_CONFORMANCE_INVARIANTS`), the transport-conformance evaluator
(:func:`evaluate_transport_conformance`), and the §30 citation status
(:data:`CITATION_STATUS`).

REUSE (never redefined here):
  - ``RESULT_TYPE_*``, :func:`is_known_result_type`, :func:`interpret_result_type` —
    :mod:`mcp.jsonrpc.payload` (S04);
  - :data:`CURRENT_PROTOCOL_VERSION`, :func:`is_supported_protocol_version`,
    :func:`validate_request_meta`, the per-request ``_meta`` envelope keys —
    :mod:`mcp.protocol.meta` (S05);
  - :data:`UNSUPPORTED_PROTOCOL_VERSION_CODE`, :data:`MISSING_CLIENT_CAPABILITY_CODE`,
    :data:`INVALID_PARAMS_CODE` — :mod:`mcp.protocol.errors` (S34);
  - :func:`compute_missing_client_capabilities` — :mod:`mcp.protocol.capability_negotiation` (S10);
  - :func:`is_result_type_accepted` — :mod:`mcp.protocol.extension_mechanism` (S38);
  - :func:`is_valid_extension_id` — :mod:`mcp.protocol.extensions` (S38);
  - :data:`RECOGNIZED_INPUT_REQUEST_METHODS` — :mod:`mcp.protocol.multi_round_trip` (S17);
  - :class:`FeatureStatus` — :mod:`mcp.protocol.conformance` (S43, NOT redefined).

The §35 transport-family authorization logic (HTTP vs stdio applicability and the
credential-conveyance mode) is mirrored locally as private helpers, since the
``mcp.protocol.authorization`` module is owned by another story; the behavior is
identical to S35's ``authorizationAppliesTo`` / ``authorizationForbiddenFor`` /
``credentialConveyanceFor`` (§23.1, R-23.1-a – R-23.1-c).

Out of scope (owned elsewhere, per the story §5): the definition of the error codes
and their ``data`` shapes (S34), ``server/discover`` mechanics (S08/S09), the
``_meta`` envelope / stateless-model definitions (S05/S06), the per-feature
MUST-level behaviors (S16–S31), the extension/Tasks/UI definitions (S38–S42),
deprecated features (S32/S33/S43), transport framing (S12–S15), the authorization
framework (S35–S37), and the consolidated registries (S46).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Final, Iterable, Literal, Mapping

from mcp.jsonrpc.payload import (
  interpret_result_type,
  is_known_result_type,
)
from mcp.protocol.capability_negotiation import compute_missing_client_capabilities
from mcp.protocol.errors import (
  INVALID_PARAMS_CODE,
  MISSING_CLIENT_CAPABILITY_CODE,
  UNSUPPORTED_PROTOCOL_VERSION_CODE,
)
from mcp.protocol.extension_mechanism import is_result_type_accepted
from mcp.protocol.extensions import is_valid_extension_id
from mcp.protocol.meta import (
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  CURRENT_PROTOCOL_VERSION,
  PROTOCOL_VERSION_META_KEY,
  is_supported_protocol_version,
  validate_request_meta,
)
from mcp.protocol.multi_round_trip import RECOGNIZED_INPUT_REQUEST_METHODS

import re


def _is_object(value: object) -> bool:
  """Return ``True`` when ``value`` is a non-null, non-array object (a ``dict``)."""
  return isinstance(value, dict)


# A well-formed ``YYYY-MM-DD`` revision identifier (§5.1) — matched verbatim against
# the TS ``/^\d{4}-\d{2}-\d{2}$/`` so a malformed version field falls through to the
# envelope (-32602) stage rather than the revision (-32004) stage.
_REVISION_FORMAT_RE: Final = re.compile(r"^\d{4}-\d{2}-\d{2}$")


# ─── §29.1 — The three conformance axes ─────────────────────────────────────────

#: A role an implementation plays. A requirement naming a role binds an
#: implementation only when it plays that role; an implementation playing BOTH
#: MUST satisfy each role's requirements. (§29.1, R-29.1-a, R-29.1-b)
ConformanceRole = Literal["client", "server"]

#: A transport an implementation may implement. Open-ended (``str``) because §7's
#: transport set is extensible, but the two core transports are named.
#: (§29.8, R-29.8-a)
ConformanceTransport = str

#: The three independent axes along which conformance is scoped. (§29.1) Conformance
#: is the product of these: an implementation is conformant iff every applicable
#: requirement on its chosen roles, advertised features, and implemented transports
#: is satisfied.
#:
#:   - ``role``      — client / server / both (§29.1 item 1);
#:   - ``feature``   — baseline plus advertised capabilities/extensions (§29.1 item 2);
#:   - ``transport`` — each transport, independently (§29.1 item 3).
ConformanceAxis = Literal["role", "feature", "transport"]

#: The three conformance axes, in spec order. (§29.1)
CONFORMANCE_AXES: Final[tuple[ConformanceAxis, ...]] = ("role", "feature", "transport")


# ─── §2 / RFC 2119 — Requirement-level classifier ───────────────────────────────

#: A normative requirement level, in the RFC 2119 / RFC 8174 sense as established by
#: §2. The ``MAY``/``OPTIONAL``/``SHOULD`` family is conditionally applicable; the
#: ``MUST`` family is unconditional. (§29.1, R-29.1-a)
#:
#:   - ``MUST``   — also covers MUST NOT / REQUIRED / SHALL / SHALL NOT;
#:   - ``SHOULD`` — also covers SHOULD NOT / RECOMMENDED;
#:   - ``MAY``    — also covers OPTIONAL.
RequirementLevel = Literal["MUST", "SHOULD", "MAY"]

#: Every distinct RFC 2119 keyword recognized in the story's atoms, mapped to its
#: canonical :data:`RequirementLevel` family. (§2) The keys are the exact tokens the
#: story uses in its ``[R-… · KEYWORD]`` markers.
REQUIREMENT_KEYWORDS: Final[dict[str, RequirementLevel]] = {
  "MUST": "MUST",
  "MUST NOT": "MUST",
  "REQUIRED": "MUST",
  "SHALL": "MUST",
  "SHALL NOT": "MUST",
  "SHOULD": "SHOULD",
  "SHOULD NOT": "SHOULD",
  "RECOMMENDED": "SHOULD",
  "MAY": "MAY",
  "OPTIONAL": "MAY",
}

#: A normative keyword as it appears in a requirement marker. (keys of
#: :data:`REQUIREMENT_KEYWORDS`)
RequirementKeyword = str

#: The three requirement-level families, strongest first. (§2)
REQUIREMENT_LEVELS: Final[tuple[RequirementLevel, ...]] = ("MUST", "SHOULD", "MAY")


def classify_requirement_level(keyword: str) -> RequirementLevel | None:
  """Classify a normative ``keyword`` into its :data:`RequirementLevel` family. (§2)

  Returns ``None`` for an unrecognized token — never raises, so a conformance
  harness can report rather than crash on a malformed marker.
  """
  return REQUIREMENT_KEYWORDS.get(keyword)


def is_mandatory_keyword(keyword: str) -> bool:
  """Return ``True`` when ``keyword`` is a MANDATORY keyword (MUST / MUST NOT /
  REQUIRED / SHALL / SHALL NOT): an absolute requirement whose violation is
  non-conformance. (§2, R-29.1-a)
  """
  return classify_requirement_level(keyword) == "MUST"


def is_advisory_keyword(keyword: str) -> bool:
  """Return ``True`` when ``keyword`` is ADVISORY (SHOULD / SHOULD NOT / RECOMMENDED):
  valid reasons may exist to deviate, but the full implications must be understood
  and weighed. (§2)
  """
  return classify_requirement_level(keyword) == "SHOULD"


def is_optional_keyword(keyword: str) -> bool:
  """Return ``True`` when ``keyword`` is OPTIONAL (MAY / OPTIONAL): truly
  discretionary; an implementation that omits the behavior remains conformant.
  (§2, §29.5)
  """
  return classify_requirement_level(keyword) == "MAY"


# ─── The conformance-requirement registry (§29) ─────────────────────────────────

@dataclass(frozen=True)
class ConformanceRequirement:
  """One normative requirement ("atom") of §29/§30, identified by its stable
  requirement id, the section it belongs to, the role(s)/axis it binds, and its
  RFC 2119 level. This is the data form of the story's §7 behavior table; a
  conformance harness enumerates it to know exactly what to check.
  """

  #: The stable requirement id, e.g. ``"R-29.2-h"``. (story §10 traceability)
  id: str
  #: The §29/§30 subsection this atom belongs to, e.g. ``"29.2"``.
  section: str
  #: The RFC 2119 keyword exactly as the story marks it. (§2)
  keyword: RequirementKeyword
  #: The canonical level family derived from :attr:`keyword`.
  level: RequirementLevel
  #: Which conformance axis the requirement constrains. (§29.1)
  axis: ConformanceAxis
  #: The role(s) the requirement binds; empty ⇒ binds every role. (§29.1)
  roles: tuple[ConformanceRole, ...]
  #: A one-line restatement of the obligation.
  statement: str


def _req(
  id: str,
  section: str,
  keyword: RequirementKeyword,
  axis: ConformanceAxis,
  roles: tuple[ConformanceRole, ...],
  statement: str,
) -> ConformanceRequirement:
  """Build a :class:`ConformanceRequirement`, deriving ``level`` from ``keyword``."""
  return ConformanceRequirement(
    id=id,
    section=section,
    keyword=keyword,
    level=REQUIREMENT_KEYWORDS[keyword],
    axis=axis,
    roles=roles,
    statement=statement,
  )


_BOTH: Final[tuple[ConformanceRole, ...]] = ("client", "server")
_SERVER: Final[tuple[ConformanceRole, ...]] = ("server",)
_CLIENT: Final[tuple[ConformanceRole, ...]] = ("client",)


#: The complete registry of §29/§30 normative requirements, in document order.
#: (§29.1–§29.9, §30) Each entry mirrors exactly one ``[R-… · KEYWORD]`` atom from
#: the story's §7; the keyword and level honor the spec verbatim. A conformance
#: suite iterates this to enumerate every applicable obligation for a profile
#: (see :func:`requirements_for_profile`).
CONFORMANCE_REQUIREMENTS: Final[tuple[ConformanceRequirement, ...]] = (
  # §29.1 — Meaning of conformance
  _req("R-29.1-a", "29.1", "MUST", "role", _BOTH, "Conformant iff every applicable normative requirement for the roles played and features advertised is satisfied."),
  _req("R-29.1-b", "29.1", "MUST", "role", _BOTH, "An implementation playing both client and server roles must satisfy each role’s requirements."),
  _req("R-29.1-c", "29.1", "MUST", "feature", _BOTH, "Every conformant implementation uses the §3 base message format for all protocol traffic."),
  _req("R-29.1-d", "29.1", "MUST", "feature", _BOTH, "Every conformant implementation operates under the stateless, per-request model of §4."),
  _req("R-29.1-e", "29.1", "MUST NOT", "feature", _BOTH, "Deriving protocol-significant state from connection/process/stream identity rather than the §4 envelope is non-conformant."),
  _req("R-29.1-f", "29.1", "MAY", "feature", _BOTH, "Requirements may be satisfied by any internal architecture in any language; only messages and observable behavior are constrained."),

  # §29.2 — Baseline server conformance
  _req("R-29.2-a", "29.2", "MUST", "role", _SERVER, "A server implements server/discover; its obligation to answer is unconditional."),
  _req("R-29.2-b", "29.2", "MAY", "role", _CLIENT, "A client may call server/discover before any other request, but is not obligated to."),
  _req("R-29.2-c", "29.2", "MUST", "role", _SERVER, "A server advertises its supported revisions and capabilities via server/discover, consistently with §6."),
  _req("R-29.2-d", "29.2", "MUST NOT", "role", _SERVER, "A server must not advertise a revision or capability whose required behavior it does not implement."),
  _req("R-29.2-e", "29.2", "MUST", "role", _SERVER, "A server honors the §4 per-request metadata envelope on every request."),
  _req("R-29.2-f", "29.2", "MUST NOT", "role", _SERVER, "A server must not infer protocol-significant state across requests, even on the same connection/process/stream."),
  _req("R-29.2-g", "29.2", "MUST NOT", "role", _SERVER, "A server must not require a client to reuse the same connection or process for related operations."),
  _req("R-29.2-h", "29.2", "MUST", "role", _SERVER, "An unsupported declared revision is rejected with -32004 whose data lists supported revisions and the requested one."),
  _req("R-29.2-i", "29.2", "MUST", "role", _SERVER, "A request needing an undeclared client capability is rejected with -32003 whose data.requiredCapabilities carries the ClientCapabilities."),
  _req("R-29.2-j", "29.2", "MUST", "role", _SERVER, "A request omitting any §4-required field is malformed and rejected with -32602 (Invalid params)."),
  _req("R-29.2-k", "29.2", "MUST", "role", _SERVER, "A server sets the resultType discriminator on every successful result."),
  _req("R-29.2-l", "29.2", "MUST", "role", _SERVER, "The resultType value is drawn from the core set plus values contributed by advertised extensions only."),
  _req("R-29.2-m", "29.2", "MUST", "role", _SERVER, "A server gates every feature behind its advertised capability."),
  _req("R-29.2-n", "29.2", "MUST NOT", "role", _SERVER, "A server must not expose/exercise/depend on unadvertised behavior, nor solicit an undeclared client behavior."),

  # §29.3 — Baseline client conformance
  _req("R-29.3-a", "29.3", "MUST", "role", _CLIENT, "Every client request carries the protocol revision, client identity, and relevant client capabilities in per-request metadata."),
  _req("R-29.3-b", "29.3", "MUST", "role", _CLIENT, "A client sends a revision it supports and can select a mutually supported revision."),
  _req("R-29.3-c", "29.3", "SHOULD", "role", _CLIENT, "On a -32004 the client should reselect from the server’s supported list and retry, or surface an error if none overlaps."),
  _req("R-29.3-d", "29.3", "MUST", "role", _CLIENT, "A client treats designated-opaque values (cursors, requestState, subscription ids, handles) as opaque."),
  _req("R-29.3-e", "29.3", "MUST NOT", "role", _CLIENT, "A client must not inspect/parse/modify/assume anything about designated-opaque values."),
  _req("R-29.3-f", "29.3", "MUST", "role", _CLIENT, "When echoing an opaque value back, the client echoes the exact value unchanged."),
  _req("R-29.3-g", "29.3", "MUST", "role", _CLIENT, "A client can fulfill an input_required result for the capabilities it declares."),
  _req("R-29.3-h", "29.3", "MUST", "role", _CLIENT, "On an input_required carrying input requests, the client constructs the inputs before retrying."),
  _req("R-29.3-i", "29.3", "MAY", "role", _CLIENT, "If no input requests are present in an input_required result, the client may retry immediately."),
  _req("R-29.3-j", "29.3", "MUST", "role", _CLIENT, "The retry uses a distinct request id, echoes requestState exactly when provided, and omits it when none was provided."),
  _req("R-29.3-k", "29.3", "MUST", "role", _CLIENT, "A client interprets each result by its resultType and applies the §29.6 robustness rules to unrecognized values/fields/codes."),

  # §29.4 — Capability-conditioned conformance
  _req("R-29.4-a", "29.4", "MUST", "feature", _BOTH, "Advertising a capability binds the implementation to every MUST-level behavior defined for it."),
  _req("R-29.4-b", "29.4", "MUST", "feature", _SERVER, "A server advertising tools satisfies the tools requirements of §16."),
  _req("R-29.4-c", "29.4", "MUST", "feature", _SERVER, "A server advertising resources satisfies §17, and resource subscriptions additionally satisfy §10."),
  _req("R-29.4-d", "29.4", "MUST", "feature", _SERVER, "A server advertising prompts satisfies the prompts requirements of §18."),
  _req("R-29.4-e", "29.4", "MUST", "feature", _SERVER, "A server advertising completion satisfies the completion requirements of §19."),
  _req("R-29.4-f", "29.4", "MUST", "feature", _CLIENT, "A client advertising elicitation satisfies the elicitation requirements of §20."),
  _req("R-29.4-g", "29.4", "MUST", "feature", _BOTH, "Any party advertising a streaming or subscription capability satisfies the applicable requirements of §10."),
  _req("R-29.4-h", "29.4", "MUST NOT", "feature", _BOTH, "An implementation must not exercise/expose/depend on a feature it has not advertised."),
  _req("R-29.4-i", "29.4", "MUST NOT", "feature", _SERVER, "A server must not return a result type, solicit a client capability, or invoke a behavior outside what it advertised."),
  _req("R-29.4-j", "29.4", "MUST NOT", "feature", _BOTH, "An implementation must not advertise a capability whose required behavior it does not implement."),
  _req("R-29.4-k", "29.4", "MUST NOT", "feature", _SERVER, "A server must not rely on an undeclared client capability; if required, it responds with -32003."),
  _req("R-29.4-l", "29.4", "MUST NOT", "feature", _SERVER, "A server must not place an input request of a kind the client has not declared into an input_required result."),
  _req("R-29.4-m", "29.4", "MUST", "feature", _BOTH, "For a deprecated client-provided capability, an implementation that advertises one implements its specified behavior."),
  _req("R-29.4-n", "29.4", "MUST NOT", "feature", _BOTH, "For a deprecated client-provided capability, an implementation that does not advertise one must not rely on it."),

  # §29.5 — Optionality of extensions and deprecated features
  _req("R-29.5-a", "29.5", "OPTIONAL", "feature", _BOTH, "The extension mechanism, Tasks, and UI extensions are optional; advertising zero extensions is fully conformant."),
  _req("R-29.5-b", "29.5", "MUST", "feature", _BOTH, "An implementation advertising an extension implements its MUST-level behaviors and follows its declared fallback."),
  _req("R-29.5-c", "29.5", "MUST", "feature", _BOTH, "Extension identifiers follow the naming rules of §6."),
  _req("R-29.5-d", "29.5", "MUST", "feature", _BOTH, "When a peer lacks an advertised extension, the supporting party reverts to core behavior or rejects with an appropriate error."),
  _req("R-29.5-e", "29.5", "OPTIONAL", "feature", _BOTH, "Features whose status is Deprecated are optional to implement."),
  _req("R-29.5-f", "29.5", "MUST", "feature", _BOTH, "A Deprecated feature that is implemented follows its specified behavior in full; partial/divergent implementation is non-conformant."),

  # §29.6 — Robustness and forward compatibility
  _req("R-29.6-a", "29.6", "MUST", "feature", _BOTH, "A conformant implementation is tolerant of inputs richer than it understands."),
  _req("R-29.6-b", "29.6", "MUST", "feature", _BOTH, "An implementation ignores unrecognized fields in any received object rather than rejecting the message."),
  _req("R-29.6-c", "29.6", "MUST", "feature", _BOTH, "An implementation ignores unrecognized advertised capabilities and does not treat them as an error."),
  _req("R-29.6-d", "29.6", "MUST", "feature", _BOTH, "An implementation ignores unrecognized extension identifiers in the extensions map (triggering §29.5 fallback)."),
  _req("R-29.6-e", "29.6", "MUST", "role", _CLIENT, "A client accepts unrecognized error codes as request failures without crashing or misclassifying them."),
  _req("R-29.6-f", "29.6", "MUST", "feature", _BOTH, "A resultType value not recognized by the receiver is treated as an error."),
  _req("R-29.6-g", "29.6", "MUST NOT", "role", _CLIENT, "A client must not act on a result whose discriminator it cannot interpret."),
  _req("R-29.6-h", "29.6", "MUST", "feature", _BOTH, "Where the resultType discriminator is absent, the receiver applies the §3 absence rule."),
  _req("R-29.6-i", "29.6", "MUST NOT", "feature", _BOTH, "Ignoring the unrecognized must not silently discard understood, semantically required content."),

  # §29.7 — Conformance and the stateless model
  _req("R-29.7-a", "29.7", "MUST", "feature", _SERVER, "A server processes each request independently and must not infer context from any earlier request."),
  _req("R-29.7-b", "29.7", "MUST", "feature", _BOTH, "State spanning requests is referenced by an explicit identifier or opaque value the client supplies on each request."),
  _req("R-29.7-c", "29.7", "MUST NOT", "feature", _BOTH, "An implementation must not treat the connection/process as the lifetime boundary of a conversation, task, or subscription."),
  _req("R-29.7-d", "29.7", "MUST", "feature", _SERVER, "A requestState that passes through a client is treated as attacker-controlled input."),
  _req("R-29.7-e", "29.7", "MUST", "feature", _SERVER, "If requestState influences authorization/resource access/business logic, the server protects its integrity and rejects state failing verification."),

  # §29.8 — Transport conformance
  _req("R-29.8-a", "29.8", "MUST", "transport", _BOTH, "A conformant implementation implements at least one §7 transport."),
  _req("R-29.8-b", "29.8", "MUST", "transport", _BOTH, "Each implemented transport upholds its framing, routing, and error-mapping requirements (stdio §8, Streamable HTTP §9)."),
  _req("R-29.8-c", "29.8", "MUST", "transport", _BOTH, "On Streamable HTTP, -32602 (malformed/missing field) and -32003 (missing required capability) map to the prescribed HTTP statuses."),
  _req("R-29.8-d", "29.8", "SHOULD", "transport", _BOTH, "An HTTP-based transport should conform to §23 Authorization."),
  _req("R-29.8-e", "29.8", "SHOULD NOT", "transport", _BOTH, "A stdio transport should not apply the authorization framework; it obtains credentials from its environment."),
  _req("R-29.8-f", "29.8", "MUST NOT", "transport", _BOTH, "Conformance of one transport must not be contingent on another; each independently satisfies its own requirements."),
  _req("R-29.8-g", "29.8", "MAY", "transport", _BOTH, "Multiple transports may be offered concurrently."),

  # §29.9 — Determining conformance
  _req("R-29.9-a", "29.9", "MAY", "feature", _BOTH, "An implementation satisfying every applicable requirement is conformant; no behavior outside this document is required."),
  _req("R-29.9-b", "29.9", "MUST", "feature", _BOTH, "An implementation either fully satisfies an advertised feature’s MUST-level behavior or must not advertise it; no partial state."),
  _req("R-29.9-c", "29.9", "MUST", "feature", _BOTH, "For features in its profile, an implementation uses the exact codes (App. B), _meta keys (App. C), and capability identifiers (App. D)."),

  # §30 — References
  _req("R-30-a", "30", "MAY", "feature", _BOTH, "Citation markers are provenance only and never load-bearing; all normative content is in the body."),
)


#: Index of :data:`CONFORMANCE_REQUIREMENTS` by requirement id, for O(1) lookup.
_REQUIREMENT_BY_ID: Final[dict[str, ConformanceRequirement]] = {
  r.id: r for r in CONFORMANCE_REQUIREMENTS
}


def lookup_requirement(id: str) -> ConformanceRequirement | None:
  """Look up a requirement by its id (e.g. ``"R-29.2-h"``), or ``None``."""
  return _REQUIREMENT_BY_ID.get(id)


def requirements_for_axis(axis: ConformanceAxis) -> list[ConformanceRequirement]:
  """Return every requirement whose ``axis`` matches. (§29.1)"""
  return [r for r in CONFORMANCE_REQUIREMENTS if r.axis == axis]


def requirements_for_role(role: ConformanceRole) -> list[ConformanceRequirement]:
  """Return every requirement that binds ``role``. A requirement with an empty
  ``roles`` list binds every role; otherwise it binds only the named roles.
  (§29.1 item 1)
  """
  return [r for r in CONFORMANCE_REQUIREMENTS if len(r.roles) == 0 or role in r.roles]


# ─── §6 / Appendix D — Capability → obligation map (§29.4) ───────────────────────

@dataclass(frozen=True)
class CapabilityObligation:
  """One capability-conditioned obligation: advertising ``capability`` binds the
  advertising ``party`` to the MUST-level requirements of ``section``. (§29.4 item 1,
  R-29.4-b – R-29.4-g) The data form of "advertise implies implement".
  """

  #: The advertised capability identifier (Appendix D / §6).
  capability: str
  #: Which party advertises and is thereby bound.
  party: ConformanceRole
  #: The spec section whose MUST-level behavior the advertiser must satisfy.
  section: str
  #: Any additional sections also bound by this capability (e.g. subscriptions → §10).
  additional_sections: tuple[str, ...]


#: The per-capability obligation map of §29.4: each advertised capability binds its
#: advertiser to a feature section's MUST-level behavior. (R-29.4-b – R-29.4-g)
#:
#:   tools        → §16
#:   resources    → §17  (resources.subscribe additionally → §10)
#:   prompts      → §18
#:   completions  → §19
#:   elicitation  → §20  (client)
CAPABILITY_OBLIGATIONS: Final[tuple[CapabilityObligation, ...]] = (
  CapabilityObligation("tools", "server", "16", ()),
  CapabilityObligation("resources", "server", "17", ()),
  CapabilityObligation("resources.subscribe", "server", "17", ("10",)),
  CapabilityObligation("prompts", "server", "18", ()),
  CapabilityObligation("completions", "server", "19", ()),
  CapabilityObligation("elicitation", "client", "20", ()),
)


def obligation_for_capability(capability: str) -> CapabilityObligation | None:
  """Return the obligation a party incurs by advertising ``capability``, or ``None``
  when the capability carries no enumerated feature-section obligation beyond the
  baseline. (§29.4)
  """
  for obligation in CAPABILITY_OBLIGATIONS:
    if obligation.capability == capability:
      return obligation
  return None


def obliged_sections_for_capabilities(advertised: Iterable[str]) -> list[str]:
  """Return the spec sections whose MUST-level behavior an implementation is bound
  to, given the capabilities it advertises. (§29.4 item 1, R-29.4-a – R-29.4-g)

  The result is deterministic, de-duplicated, and includes the additional sections
  (e.g. ``resources.subscribe`` adds ``"10"``), sorted numerically.
  """
  sections: set[str] = set()
  for capability in advertised:
    obligation = obligation_for_capability(capability)
    if obligation is None:
      continue
    sections.add(obligation.section)
    for extra in obligation.additional_sections:
      sections.add(extra)
  return sorted(sections, key=lambda s: int(s))


# ─── §29.2 — Baseline server request disposition ────────────────────────────────

@dataclass(frozen=True)
class ServerRequestDisposition:
  """The disposition a conformant server reaches for an incoming request after the
  ordered §29.2 checks. Either a rejection carrying the registry-exact code, or
  acceptance (the request proceeds to a resultType-tagged success). (§29.2)

  ``ok`` is the discriminator. On rejection, ``stage`` names which §29.2 check
  failed:

    - ``"revision"``   — §29.2 item 4: unsupported declared revision. (R-29.2-h)
      carries ``code`` (-32004) and ``data = {"supported": [...], "requested": ...}``;
    - ``"envelope"``   — §29.2 item 6: a §4-required field is missing/malformed.
      (R-29.2-j) carries ``code`` (-32602) and ``message``;
    - ``"capability"`` — §29.2 item 5: a required client capability not declared.
      (R-29.2-i, R-29.4-k) carries ``code`` (-32003) and
      ``data = {"requiredCapabilities": {...}}``;
    - ``"gating"``     — §29.2 item 8: the feature is not gated by an advertised
      capability. (R-29.2-m, R-29.2-n) carries ``reason = "not-advertised"``.

  On acceptance ``ok`` is ``True`` and every other field is ``None``.
  """

  ok: bool
  stage: Literal["revision", "envelope", "capability", "gating"] | None = None
  code: int | None = None
  message: str | None = None
  data: dict | None = None
  reason: str | None = None


@dataclass(frozen=True)
class ServerRequestContext:
  """Inputs to :func:`classify_server_request`: a single self-contained §4 request
  and the server's surface.
  """

  #: The request's ``params._meta`` envelope (raw).
  meta: dict
  #: The revisions the server supports (always includes the wire value).
  server_supported_revisions: tuple[str, ...] | list[str]
  #: The capabilities required to process this request, as a ClientCapabilities map.
  required_client_capabilities: dict | None = None
  #: Whether the requested feature is gated behind a capability the server advertised.
  #: ``None`` means "not applicable / no gate to evaluate"; ``False`` means refused.
  feature_advertised: bool | None = None


def classify_server_request(ctx: ServerRequestContext) -> ServerRequestDisposition:
  """Apply the ordered §29.2 baseline-server request checks to ONE self-contained §4
  request and return its :class:`ServerRequestDisposition`. (§29.2, R-29.2-e –
  R-29.2-n, R-29.4-k)

  The checks run strictly in the §7 flow order — judged on this request's own
  envelope, NEVER on connection or prior-request state (R-29.1-e, R-29.2-f):

    1. revision supported?                  → else -32004 (data: supported, requested)
    2. all §4-required fields present?      → else -32602 (Invalid params)
    3. required client capability declared? → else -32003 (data.requiredCapabilities)
    4. feature gated by advertised cap?     → else refuse (not advertised)
    else → accept (proceeds to a resultType-tagged success).

  Reuses :func:`validate_request_meta` for the envelope check (so the same
  required-field set is honored) and :func:`compute_missing_client_capabilities` for
  the capability gate. The revision check uses the declared revision from the
  envelope against ``server_supported_revisions``.

  Note the ordering rationale: a malformed protocol-version field (not a
  well-formed-but-unsupported revision) is an envelope failure (-32602), so the
  revision check first asks whether the declared revision is a well-formed,
  server-unsupported one; a structurally invalid envelope falls through to the
  -32602 stage.
  """
  # (1) Unsupported revision — only when the declared version is a well-formed string
  #     the server does not support. A missing/malformed version is an envelope
  #     failure handled by step (2).
  declared_revision = ctx.meta.get(PROTOCOL_VERSION_META_KEY)
  if (
    isinstance(declared_revision, str)
    and _REVISION_FORMAT_RE.match(declared_revision)
    and declared_revision not in ctx.server_supported_revisions
  ):
    return ServerRequestDisposition(
      ok=False,
      stage="revision",
      code=UNSUPPORTED_PROTOCOL_VERSION_CODE,
      data={"supported": list(ctx.server_supported_revisions), "requested": declared_revision},
    )

  # (2) Malformed envelope — any §4-required field missing/invalid.
  meta_result = validate_request_meta(ctx.meta)
  if not meta_result.ok:
    return ServerRequestDisposition(
      ok=False, stage="envelope", code=INVALID_PARAMS_CODE, message=meta_result.message
    )

  # (3) Missing required client capability.
  if ctx.required_client_capabilities is not None:
    declared = ctx.meta.get(CLIENT_CAPABILITIES_META_KEY)
    declared_caps = declared if _is_object(declared) else {}
    required_capabilities = compute_missing_client_capabilities(
      declared_caps, ctx.required_client_capabilities
    )
    if len(required_capabilities) > 0:
      return ServerRequestDisposition(
        ok=False,
        stage="capability",
        code=MISSING_CLIENT_CAPABILITY_CODE,
        data={"requiredCapabilities": required_capabilities},
      )

  # (4) Capability gating — refuse any feature not advertised.
  if ctx.feature_advertised is False:
    return ServerRequestDisposition(ok=False, stage="gating", reason="not-advertised")

  return ServerRequestDisposition(ok=True)


@dataclass(frozen=True)
class SuccessResultTypeValidation:
  """Outcome of :func:`validate_success_result_type`.

  ``ok=True`` carries the recognized ``result_type``. ``ok=False`` carries a
  ``reason`` — ``"missing"`` (no discriminator) or ``"not-advertised"`` (present but
  not in the accepted set), and ``result_type`` only for the latter.
  """

  ok: bool
  result_type: str | None = None
  reason: Literal["missing", "not-advertised"] | None = None


def validate_success_result_type(
  result: dict,
  active_extension_set: Iterable[str] = (),
  extension_result_types: Mapping[str, Iterable[str]] | None = None,
) -> SuccessResultTypeValidation:
  """Assert that a successful result carries a ``resultType`` discriminator drawn from
  the core set plus the values of advertised extensions only. (§29.2 items 7 & 8,
  R-29.2-k, R-29.2-l)

  Returns ``ok=False`` with ``reason`` when the discriminator is absent
  (``"missing"``) or present but not in the accepted set (``"not-advertised"``).
  Reuses :func:`is_result_type_accepted` (S38) so the accepted set is exactly the
  core values plus those contributed by extensions in ``active_extension_set``.

  :param result: The success result object (raw).
  :param active_extension_set: The extensions active for this interaction.
  :param extension_result_types: Map of extension id → the resultType values it
    contributes.
  """
  raw = result.get("resultType")
  if not isinstance(raw, str):
    return SuccessResultTypeValidation(ok=False, reason="missing")
  if not is_result_type_accepted(raw, active_extension_set, extension_result_types):
    return SuccessResultTypeValidation(ok=False, reason="not-advertised", result_type=raw)
  return SuccessResultTypeValidation(ok=True, result_type=raw)


# ─── §29.3 — Baseline client conformance helpers ────────────────────────────────

def client_request_carries_baseline_envelope(meta: dict) -> bool:
  """Validate that a client request's metadata carries the three §4-required fields —
  protocol revision, client identity, and client capabilities — that baseline client
  conformance mandates on EVERY request. (§29.3 item 1, R-29.3-a)

  A thin, intention-revealing wrapper over :func:`validate_request_meta` so the
  client-side baseline check and the server-side envelope check share one
  required-field definition (the stateless model forbids relying on a remembered
  earlier request).
  """
  return validate_request_meta(meta).ok


#: The fields a client MUST include in every request's per-request metadata. (§29.3
#: item 1, R-29.3-a) Exposed for a conformance harness to assert presence.
REQUIRED_CLIENT_REQUEST_META_KEYS: Final[tuple[str, ...]] = (
  PROTOCOL_VERSION_META_KEY,
  CLIENT_INFO_META_KEY,
  CLIENT_CAPABILITIES_META_KEY,
)


@dataclass(frozen=True)
class InputRequiredRetryValidation:
  """Outcome of :func:`validate_input_required_retry`.

  ``ok=False`` carries the first violated rule in ``reason``:
    - ``"reused-id"``       — the retry reused the original request id;
    - ``"state-mismatch"``  — provided requestState was not echoed byte-for-byte;
    - ``"unexpected-state"``— a requestState was included when none was provided.
  """

  ok: bool
  reason: Literal["reused-id", "state-mismatch", "unexpected-state"] | None = None


# Sentinel distinguishing "no requestState provided" from a provided ``None``-ish
# value — Python's ``None`` is a legitimate caller default, so an explicit sentinel
# preserves the TS distinction between ``undefined`` (absent) and a present value.
_NO_STATE: Final = object()


def validate_input_required_retry(
  *,
  original_id: str | int,
  retry_id: str | int,
  provided_state: object = _NO_STATE,
  retry_state: object = _NO_STATE,
) -> InputRequiredRetryValidation:
  """Validate a client's retry request after an ``input_required`` result. (§29.3
  item 4, R-29.3-j)

  The retry MUST: (a) use a request id distinct from the original, (b) echo
  ``requestState`` byte-for-byte when one was provided, and (c) omit ``requestState``
  when none was provided.

  Returns ``ok=False`` with ``reason`` identifying the first violated rule, else
  ``ok=True``. ``requestState`` comparison is strict equality (the value is opaque
  and echoed exactly, R-29.3-f). Omit ``provided_state`` / ``retry_state`` (or leave
  them at the absent sentinel) to model "no state".

  :param original_id: The original request's id.
  :param retry_id: The retry request's id (must differ).
  :param provided_state: The requestState the server provided, or absent when none.
  :param retry_state: The requestState the retry carries, or absent when none.
  """
  if retry_id == original_id:
    return InputRequiredRetryValidation(ok=False, reason="reused-id")
  if provided_state is _NO_STATE:
    # No state was provided → the retry MUST NOT include one.
    if retry_state is not _NO_STATE:
      return InputRequiredRetryValidation(ok=False, reason="unexpected-state")
    return InputRequiredRetryValidation(ok=True)
  # State was provided → the retry MUST echo it exactly.
  if retry_state != provided_state:
    return InputRequiredRetryValidation(ok=False, reason="state-mismatch")
  return InputRequiredRetryValidation(ok=True)


# ─── §29.4 item 5 — No unsolicited input requests ───────────────────────────────

#: The map from an input-request kind to the client capability that authorizes a
#: server to place it into an ``input_required`` result. (§29.4 item 5, R-29.4-l)
#: A server MUST NOT include an input request of a kind the client has not declared
#: (e.g. no elicitation input request without the elicitation capability).
INPUT_REQUEST_REQUIRED_CAPABILITY: Final[dict[str, str]] = {
  "elicitation/create": "elicitation",
  "roots/list": "roots",
  "sampling/createMessage": "sampling",
}


def may_place_input_request(method: str, client_capabilities: dict) -> bool:
  """Return ``True`` when a server MAY place an input request of ``method`` into an
  ``input_required`` result for a client declaring ``client_capabilities``. (§29.4
  item 5, R-29.4-l)

  An unrecognized method is rejected (``False``): a server must not solicit a kind it
  cannot tie to a declared capability. Reuses :data:`RECOGNIZED_INPUT_REQUEST_METHODS`
  (S17) for the recognized-kind set and :data:`INPUT_REQUEST_REQUIRED_CAPABILITY` for
  the gating capability.
  """
  if method not in RECOGNIZED_INPUT_REQUEST_METHODS:
    return False
  required = INPUT_REQUEST_REQUIRED_CAPABILITY.get(method)
  if required is None:
    return False
  return required in client_capabilities


# ─── §29.6 — Robustness & forward compatibility ─────────────────────────────────

#: How a conformant receiver disposes of an element of a received message under the
#: §29.6 robustness rules. (§29.6)
#:
#:   - ``accept``         — a recognized, understood element: process it normally;
#:   - ``ignore``         — an unrecognized field/capability/extension: ignore it,
#:                          do NOT reject the message (R-29.6-b/c/d);
#:   - ``treat-as-error`` — an unrecognized resultType: the whole response is an
#:                          error and MUST NOT be acted upon (R-29.6-f/g);
#:   - ``fail-request``   — an unrecognized error code: a request failure surfaced
#:                          via message/data, never a crash/misclassification (R-29.6-e).
RobustnessDisposition = Literal["accept", "ignore", "treat-as-error", "fail-request"]

#: The kind of received element being disposed of under §29.6.
RobustnessElement = Literal["field", "capability", "extension", "result-type", "error-code"]


def robustness_disposition(element: RobustnessElement, recognized: bool) -> RobustnessDisposition:
  """Compute the §29.6 robustness disposition for one received element, given whether
  the receiver recognizes it. (§29.6, R-29.6-a – R-29.6-h)

    - an unknown ``field``/``capability``/``extension`` → ``ignore`` (never reject);
    - an unknown ``result-type`` → ``treat-as-error`` (must not act on it);
    - an unknown ``error-code``  → ``fail-request`` (surface as a failure);
    - any recognized element      → ``accept``.

  This NEVER discards understood content: robustness applies only to the unrecognized
  (R-29.6-i) — a recognized element always returns ``accept``. The absence of a
  resultType is handled by :func:`interpret_result_type` (the §3 absence rule,
  R-29.6-h), not here.
  """
  if recognized:
    return "accept"
  if element in ("field", "capability", "extension"):
    return "ignore"
  if element == "result-type":
    return "treat-as-error"
  if element == "error-code":
    return "fail-request"
  # Defensive: an unrecognized element kind is ignored rather than crashing the harness.
  return "ignore"


@dataclass(frozen=True)
class ResultActionDecision:
  """Outcome of :func:`decide_result_action`.

  ``act=True`` carries the recognized ``result_type`` (the receiver MAY act).
  ``act=False`` carries ``reason="unrecognized"`` and the offending ``result_type``
  (treat the whole response as an error, do not act).
  """

  act: bool
  result_type: str
  reason: Literal["unrecognized"] | None = None


def decide_result_action(
  result: dict,
  active_extension_set: Iterable[str] = (),
  extension_result_types: Mapping[str, Iterable[str]] | None = None,
) -> ResultActionDecision:
  """Apply the §29.6 + §3 receiver rules to a result's ``resultType``. (R-29.6-f,
  R-29.6-g, R-29.6-h) Returns:

    - ``act=True`` with ``result_type``   — recognized (core or, when supplied, an
      accepted extension value): the receiver MAY act on the result;
    - ``act=False`` with ``reason="unrecognized"`` and ``result_type`` — present but
      not accepted: treat the whole response as an error, do not act (R-29.6-f/g).

  An ABSENT discriminator is resolved by the §3 absence rule via
  :func:`interpret_result_type` (treated as ``"complete"``, recognized) so the
  receiver acts on it (R-29.6-h).
  """
  raw = result.get("resultType")
  # §3 absence rule (R-29.6-h): an absent/null discriminator is "complete".
  if raw is None:
    interpreted = interpret_result_type(result)
    return ResultActionDecision(act=True, result_type=interpreted.result_type)
  value = str(raw)
  if is_known_result_type(value) or is_result_type_accepted(
    value, active_extension_set, extension_result_types
  ):
    return ResultActionDecision(act=True, result_type=value)
  return ResultActionDecision(act=False, result_type=value, reason="unrecognized")


# ─── §29.7 — Stateless-model conformance invariants ─────────────────────────────

#: The stateless-model invariants that bind every role. (§29.7, R-29.7-a – R-29.7-e)
#: A flat, enumerable restatement a conformance harness can assert against.
STATELESS_CONFORMANCE_INVARIANTS: Final[dict[str, bool]] = {
  # Each request is processed independently; no context inferred from an earlier one. (R-29.7-a)
  "independentRequests": True,
  # Cross-request state rides an explicit client-supplied identifier/opaque value. (R-29.7-b)
  "explicitCrossRequestState": True,
  # The connection/process is NOT the lifetime boundary of a conversation/task/subscription. (R-29.7-c)
  "connectionIsNotLifetimeBoundary": True,
  # A requestState passing through a client is attacker-controlled input. (R-29.7-d)
  "requestStateIsUntrusted": True,
  # A security-significant requestState is integrity-protected; failed verification is rejected. (R-29.7-e)
  "requestStateIntegrityProtected": True,
}


@dataclass(frozen=True)
class RequestStateHandling:
  """Outcome of :func:`decide_request_state_handling`.

  ``trust`` is always ``"untrusted"``; ``action`` is ``"reject"`` only for a
  security-significant value whose integrity check failed, else ``"accept"``.
  """

  trust: Literal["untrusted"]
  action: Literal["accept", "reject"]


def decide_request_state_handling(
  security_significant: bool, integrity_verified: bool
) -> RequestStateHandling:
  """Decide how a server must treat a ``requestState`` value that passed through a
  client. (§29.7 item 4, R-29.7-d, R-29.7-e)

  It is ALWAYS attacker-controlled input; when it influences authorization, resource
  access, or business logic the server MUST verify its integrity and reject what
  fails.

  :param security_significant: Whether the value influences authz/resource/business logic.
  :param integrity_verified: Whether the value's integrity check passed.
  """
  if security_significant and not integrity_verified:
    return RequestStateHandling(trust="untrusted", action="reject")
  return RequestStateHandling(trust="untrusted", action="accept")


# ─── §29.8 — Transport conformance ──────────────────────────────────────────────

#: The Streamable HTTP status a protocol error code maps to on that transport. (§29.8 item 3)
STREAMABLE_HTTP_NEGOTIATION_ERROR_STATUS: Final = 400


def streamable_http_status_for_protocol_error(code: int) -> int | None:
  """Map a protocol error ``code`` to the HTTP status it MUST ride on the Streamable
  HTTP transport for the §29.8 negotiation/envelope conditions. (§29.8 item 3,
  R-29.8-c)

  ``-32602`` (malformed/missing field) and ``-32003`` (missing required client
  capability) both map to ``400 Bad Request``; any other code returns ``None`` (its
  mapping is governed by §9 / S34, not this conformance point).
  """
  if code in (INVALID_PARAMS_CODE, MISSING_CLIENT_CAPABILITY_CODE):
    return STREAMABLE_HTTP_NEGOTIATION_ERROR_STATUS
  return None


# §35 transport-family authorization logic, mirrored locally (the authorization
# module is owned by another story). Identical to S35's TransportFamily /
# authorizationAppliesTo / authorizationForbiddenFor / credentialConveyanceFor.
# (§23.1, R-23.1-a – R-23.1-c)
_TransportFamily = Literal["http", "stdio", "other"]
CredentialConveyance = Literal["bearer", "environment", "best-practice"]


def _authorization_applies_to(family: _TransportFamily) -> bool:
  """Return ``True`` when the §23 authorization flow applies to ``family`` (HTTP only)."""
  return family == "http"


def _authorization_forbidden_for(family: _TransportFamily) -> bool:
  """Return ``True`` when ``family`` MUST NOT use the §23 authorization flow (stdio)."""
  return family == "stdio"


def _credential_conveyance_for(family: _TransportFamily) -> CredentialConveyance:
  """Return how credentials are conveyed for ``family``. (R-23.1-a – R-23.1-c)"""
  if family == "http":
    return "bearer"
  if family == "stdio":
    return "environment"
  return "best-practice"


@dataclass(frozen=True)
class TransportConformance:
  """The conformance evaluation of a SINGLE transport an implementation offers. (§29.8)"""

  #: The transport being evaluated.
  transport: ConformanceTransport
  #: Whether the authorization framework SHOULD apply (HTTP) — R-29.8-d.
  authorization_applies: bool
  #: Whether the authorization framework SHOULD NOT apply (stdio) — R-29.8-e.
  authorization_forbidden: bool
  #: How credentials are conveyed for this transport.
  credential_conveyance: CredentialConveyance


def _transport_family_of(transport: ConformanceTransport) -> _TransportFamily:
  """Map a :data:`ConformanceTransport` to the S35 transport family."""
  if transport == "stdio":
    return "stdio"
  if transport in ("streamable-http", "http"):
    return "http"
  return "other"


def evaluate_transport_conformance(transport: ConformanceTransport) -> TransportConformance:
  """Evaluate the authorization-applicability conformance points for a single
  transport. (§29.8 items 4 & 5, R-29.8-d, R-29.8-e)

  Mirrors S35's HTTP-vs-stdio rule with one source of truth: an HTTP-based transport
  SHOULD conform to authorization; a stdio transport SHOULD NOT apply it and obtains
  credentials from its environment.
  """
  family = _transport_family_of(transport)
  return TransportConformance(
    transport=transport,
    authorization_applies=_authorization_applies_to(family),
    authorization_forbidden=_authorization_forbidden_for(family),
    credential_conveyance=_credential_conveyance_for(family),
  )


# ─── §6 / §29.5 — Conformance profile ───────────────────────────────────────────

@dataclass(frozen=True)
class ConformanceProfile:
  """The abstract descriptor that fully describes an implementation's conformance: the
  tuple of roles, advertised revisions, advertised capabilities, advertised
  extensions, and implemented transports. (§29.9 item 3, story §6) NOT a wire message
  — it is used to reason about and report conformance.
  """

  #: The role(s) the implementation plays; binds it to each role's requirements. (R-29.1-b)
  roles: tuple[ConformanceRole, ...] | list[ConformanceRole]
  #: The advertised protocol revisions; MUST include the wire value ``2026-07-28``. (R-29.9-c)
  revisions: tuple[str, ...] | list[str]
  #: The advertised capability identifiers (Appendix D / §6).
  capabilities: tuple[str, ...] | list[str]
  #: The advertised extension identifiers; MAY be empty (zero extensions is conformant). (R-29.5-a)
  extensions: tuple[str, ...] | list[str]
  #: The implemented transports; at least one, each independently conformant. (R-29.8-a)
  transports: tuple[ConformanceTransport, ...] | list[ConformanceTransport]


@dataclass(frozen=True)
class ConformanceProfileViolation:
  """A single way a :class:`ConformanceProfile` fails to be well-formed."""

  #: Which profile field the violation concerns.
  field: Literal["roles", "revisions", "capabilities", "extensions", "transports"]
  #: Human-readable description of the violation, citing the requirement.
  message: str


@dataclass(frozen=True)
class ConformanceProfileValidation:
  """Outcome of :func:`validate_conformance_profile`.

  ``ok=True`` ⇒ no violations. ``ok=False`` ⇒ ``violations`` accumulates EVERY
  well-formedness failure.
  """

  ok: bool
  violations: list[ConformanceProfileViolation] = field(default_factory=list)


def validate_conformance_profile(profile: ConformanceProfile) -> ConformanceProfileValidation:
  """Validate that a :class:`ConformanceProfile` is well-formed against the structural
  requirements of §29. (§29.5 item 2, §29.8 item 1, §29.9 item 3, R-29.1-b, R-29.5-c,
  R-29.8-a, R-29.9-c) Accumulates ALL violations:

    - ``roles``      — at least one, each a recognized role (R-29.1-a/b);
    - ``revisions``  — non-empty and MUST include ``2026-07-28`` (R-29.9-c);
    - ``extensions`` — every identifier well-formed per §6 naming (R-29.5-c); an empty
      list is fully conformant (R-29.5-a);
    - ``transports`` — at least one transport (R-29.8-a).

  ``capabilities`` are not constrained here beyond being a list — an unrecognized
  capability is tolerated by robustness (R-29.6-c), not a profile error.
  """
  violations: list[ConformanceProfileViolation] = []

  if len(profile.roles) == 0:
    violations.append(
      ConformanceProfileViolation(
        field="roles",
        message="A profile must declare at least one role (client/server) (R-29.1-a).",
      )
    )
  for role in profile.roles:
    if role != "client" and role != "server":
      violations.append(
        ConformanceProfileViolation(
          field="roles", message=f'Unrecognized role "{role}" (R-29.1-a).'
        )
      )

  if len(profile.revisions) == 0:
    violations.append(
      ConformanceProfileViolation(
        field="revisions",
        message="A profile must advertise at least one protocol revision (R-29.9-c).",
      )
    )
  if CURRENT_PROTOCOL_VERSION not in profile.revisions:
    violations.append(
      ConformanceProfileViolation(
        field="revisions",
        message=f'Advertised revisions must include the wire value "{CURRENT_PROTOCOL_VERSION}" (R-29.9-c).',
      )
    )

  for extension in profile.extensions:
    if not is_valid_extension_id(extension):
      violations.append(
        ConformanceProfileViolation(
          field="extensions",
          message=f'Extension identifier "{extension}" is not well-formed per §6 (R-29.5-c).',
        )
      )

  if len(profile.transports) == 0:
    violations.append(
      ConformanceProfileViolation(
        field="transports",
        message="A conformant implementation must implement at least one transport (R-29.8-a).",
      )
    )

  if len(violations) == 0:
    return ConformanceProfileValidation(ok=True)
  return ConformanceProfileValidation(ok=False, violations=violations)


def profile_supports_revision(profile: ConformanceProfile, revision: str) -> bool:
  """Return ``True`` when ``revision`` is supported as a profile revision: it is the
  current wire value, or any revision the profile advertises. (§29.9 item 3)

  Reuses :func:`is_supported_protocol_version` for the baseline wire value.
  """
  return is_supported_protocol_version(revision) or revision in profile.revisions


#: Maps a §29.4 requirement id to the capability it is conditioned on.
_REQUIREMENT_CAPABILITY_GUARD: Final[dict[str, str]] = {
  "R-29.4-b": "tools",
  "R-29.4-c": "resources",
  "R-29.4-d": "prompts",
  "R-29.4-e": "completions",
  "R-29.4-f": "elicitation",
}


def _requirement_guards_capability(requirement_id: str, capability: str) -> bool:
  """Return ``True`` when ``requirement_id`` is a §29.4 atom conditioned on ``capability``."""
  return _REQUIREMENT_CAPABILITY_GUARD.get(requirement_id) == capability


def requirements_for_profile(profile: ConformanceProfile) -> list[ConformanceRequirement]:
  """Enumerate every normative requirement that APPLIES to a profile: every baseline
  requirement for the role(s) it plays, plus every transport requirement (an
  implementation always implements at least one transport). (§29.1, §29.9 item 1)

  The result is the exact obligation set a conformance harness must verify for this
  implementation — no more, no less.

  Feature-axis requirements that are unconditional (the baseline §29.1, §29.6, §29.7,
  §29.9 atoms) always apply; the capability-conditioned §29.4 atoms apply only when
  the relevant capability is advertised — callers combine this with
  :func:`obliged_sections_for_capabilities` for the feature-section MUST-level
  behaviors owned by other stories.
  """
  role_set = set(profile.roles)
  advertised = set(profile.capabilities)
  applicable: list[ConformanceRequirement] = []
  for r in CONFORMANCE_REQUIREMENTS:
    # Role-axis: applies only when the implementation plays a bound role.
    if len(r.roles) > 0 and not any(role in role_set for role in r.roles):
      continue
    # §29.4 capability-conditioned feature atoms apply only when advertised.
    if r.section == "29.4":
      obligation = next(
        (o for o in CAPABILITY_OBLIGATIONS if _requirement_guards_capability(r.id, o.capability)),
        None,
      )
      if obligation is not None and obligation.capability not in advertised:
        continue
    applicable.append(r)
  return applicable


def satisfies_role(
  satisfied_roles: Iterable[ConformanceRole], target_role: ConformanceRole
) -> bool:
  """Return ``True`` when an implementation satisfying ONLY one role's requirements is
  conformant for ``target_role``. (§29.1, R-29.1-a, R-29.1-b)

  A both-roles implementation must satisfy each role; satisfying only the other
  role's requirements is non-conformant for ``target_role``.

  :param satisfied_roles: The roles whose requirements the implementation provably satisfies.
  :param target_role: The role whose conformance is being judged.
  """
  return target_role in set(satisfied_roles)


# ─── §29.9 — No partial feature conformance ─────────────────────────────────────

@dataclass(frozen=True)
class FeatureConformance:
  """Outcome of :func:`is_feature_fully_conformant`.

  ``ok=False`` carries ``reason="advertised-not-implemented"`` — the non-conformant
  intermediate state in which a feature is advertised but only partially implemented.
  """

  ok: bool
  reason: Literal["advertised-not-implemented"] | None = None


def is_feature_fully_conformant(advertised: bool, fully_implemented: bool) -> FeatureConformance:
  """Enforce "no partial feature conformance": an implementation either fully satisfies
  the MUST-level behavior of an advertised feature or MUST NOT advertise it. (§29.9
  item 4, R-29.9-b; the §29.4 advertise-implies-implement rule, R-29.4-a, R-29.4-j)

  Returns ``ok=False`` with ``reason="advertised-not-implemented"`` when a feature is
  advertised but not fully implemented (the non-conformant intermediate state), and
  ``ok=True`` otherwise — including when an UNadvertised feature is not implemented
  (perfectly conformant) and when an advertised feature IS fully implemented.

  :param advertised: Whether the feature is advertised.
  :param fully_implemented: Whether every MUST-level behavior of the feature is implemented.
  """
  if advertised and not fully_implemented:
    return FeatureConformance(ok=False, reason="advertised-not-implemented")
  return FeatureConformance(ok=True)


# ─── §30 — Provenance-only references ───────────────────────────────────────────

#: The status the §30 citation markers carry: provenance only, never load-bearing.
#: (§30, R-30-a) No normative behavior, code, name, or wire format depends on the
#: content of any citation; stripping or altering a marker changes nothing observable.
CITATION_STATUS: Final[dict[str, bool]] = {
  # Citations identify external sources; they are never load-bearing. (R-30-a)
  "loadBearing": False,
  # All normative content is fully specified in the document body. (R-30-a)
  "selfContained": True,
}


def is_citation_load_bearing(_citation_marker: str) -> bool:
  """Return ``False`` always: no §30 citation marker is ever load-bearing. (R-30-a)

  Provided as a predicate so a conformance harness can assert that removing a citation
  changes no required behavior — the answer is unconditionally "not load-bearing",
  independent of which marker is named.
  """
  return False
