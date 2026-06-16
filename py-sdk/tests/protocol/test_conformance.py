"""S45 — Conformance Requirements & References (§29–§30).

One or more cases per numbered acceptance criterion (AC-45.1 – AC-45.39), mirroring
the TS suite ``conformance-requirements.test.ts`` PLUS additional edge cases. The
story is conceptual: these assert the data structures and predicates that model
conformance — the requirement registry, the requirement-level classifier, the
profile descriptor + validator, the baseline server request disposition, the
capability→obligation map, the robustness disposition, the stateless invariants, the
transport-conformance evaluator, and the §30 citation status. The feature-lifecycle
vocabulary of :mod:`mcp.protocol.conformance` is exercised at the end.
"""

import re

from mcp.jsonrpc.payload import RESULT_TYPE_COMPLETE, RESULT_TYPE_INPUT_REQUIRED
from mcp.protocol.conformance import (
  FEATURE_STATUS_ACTIVE,
  FEATURE_STATUS_DEPRECATED,
  FEATURE_STATUSES,
  FeatureStatus,
  is_feature_status,
)
from mcp.protocol.conformance_requirements import (
  CAPABILITY_OBLIGATIONS,
  CITATION_STATUS,
  CONFORMANCE_AXES,
  CONFORMANCE_REQUIREMENTS,
  INPUT_REQUEST_REQUIRED_CAPABILITY,
  REQUIRED_CLIENT_REQUEST_META_KEYS,
  REQUIREMENT_KEYWORDS,
  REQUIREMENT_LEVELS,
  STATELESS_CONFORMANCE_INVARIANTS,
  STREAMABLE_HTTP_NEGOTIATION_ERROR_STATUS,
  ConformanceProfile,
  ServerRequestContext,
  classify_requirement_level,
  classify_server_request,
  client_request_carries_baseline_envelope,
  decide_request_state_handling,
  decide_result_action,
  evaluate_transport_conformance,
  is_advisory_keyword,
  is_citation_load_bearing,
  is_feature_fully_conformant,
  is_mandatory_keyword,
  is_optional_keyword,
  lookup_requirement,
  may_place_input_request,
  obligation_for_capability,
  obliged_sections_for_capabilities,
  profile_supports_revision,
  requirements_for_axis,
  requirements_for_profile,
  requirements_for_role,
  robustness_disposition,
  satisfies_role,
  streamable_http_status_for_protocol_error,
  validate_conformance_profile,
  validate_input_required_retry,
  validate_success_result_type,
)
from mcp.protocol.errors import (
  INVALID_PARAMS_CODE,
  MISSING_CLIENT_CAPABILITY_CODE,
  UNSUPPORTED_PROTOCOL_VERSION_CODE,
)
from mcp.protocol.meta import (
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  CURRENT_PROTOCOL_VERSION,
  PROTOCOL_VERSION_META_KEY,
)

SUPPORTED = [CURRENT_PROTOCOL_VERSION]

#: The complete, ordered set of §29–§30 conformance-requirement ids — the golden list the
#: registry must reproduce exactly. Verified out of band to match the ts-sdk reference
#: (``conformance-requirements.ts``) atom-for-atom. Embedded (not read from the sibling
#: project at runtime) so the py-sdk suite stays self-contained.
_GOLDEN_REQUIREMENT_IDS = (
    "R-29.1-a", "R-29.1-b", "R-29.1-c", "R-29.1-d", "R-29.1-e", "R-29.1-f",
    "R-29.2-a", "R-29.2-b", "R-29.2-c", "R-29.2-d", "R-29.2-e", "R-29.2-f",
    "R-29.2-g", "R-29.2-h", "R-29.2-i", "R-29.2-j", "R-29.2-k", "R-29.2-l",
    "R-29.2-m", "R-29.2-n", "R-29.3-a", "R-29.3-b", "R-29.3-c", "R-29.3-d",
    "R-29.3-e", "R-29.3-f", "R-29.3-g", "R-29.3-h", "R-29.3-i", "R-29.3-j",
    "R-29.3-k", "R-29.4-a", "R-29.4-b", "R-29.4-c", "R-29.4-d", "R-29.4-e",
    "R-29.4-f", "R-29.4-g", "R-29.4-h", "R-29.4-i", "R-29.4-j", "R-29.4-k",
    "R-29.4-l", "R-29.4-m", "R-29.4-n", "R-29.5-a", "R-29.5-b", "R-29.5-c",
    "R-29.5-d", "R-29.5-e", "R-29.5-f", "R-29.6-a", "R-29.6-b", "R-29.6-c",
    "R-29.6-d", "R-29.6-e", "R-29.6-f", "R-29.6-g", "R-29.6-h", "R-29.6-i",
    "R-29.7-a", "R-29.7-b", "R-29.7-c", "R-29.7-d", "R-29.7-e", "R-29.8-a",
    "R-29.8-b", "R-29.8-c", "R-29.8-d", "R-29.8-e", "R-29.8-f", "R-29.8-g",
    "R-29.9-a", "R-29.9-b", "R-29.9-c", "R-30-a",
)


def baseline_meta(overrides: dict | None = None) -> dict:
  """Build a well-formed §4 client request ``_meta`` envelope."""
  meta = {
    PROTOCOL_VERSION_META_KEY: CURRENT_PROTOCOL_VERSION,
    CLIENT_INFO_META_KEY: {"name": "c", "version": "1.0.0"},
    CLIENT_CAPABILITIES_META_KEY: {},
  }
  if overrides:
    meta.update(overrides)
  return meta


# ─── registry, axes, and requirement levels ───────────────────────────────────

class TestRegistryAxesAndLevels:
  def test_every_requirement_level_matches_canonical_family(self):
    for r in CONFORMANCE_REQUIREMENTS:
      assert r.level == REQUIREMENT_KEYWORDS[r.keyword]
      assert r.level in REQUIREMENT_LEVELS

  def test_three_axes_in_order_and_every_requirement_uses_one(self):
    assert CONFORMANCE_AXES == ("role", "feature", "transport")
    for r in CONFORMANCE_REQUIREMENTS:
      assert r.axis in CONFORMANCE_AXES

  def test_lookup_resolves_known_and_rejects_unknown(self):
    found = lookup_requirement("R-29.2-h")
    assert found is not None
    assert found.section == "29.2"
    assert lookup_requirement("R-99.9-z") is None

  def test_requirements_for_axis_and_role_partition(self):
    transport_reqs = requirements_for_axis("transport")
    assert "R-29.8-a" in [r.id for r in transport_reqs]
    assert all(r.axis == "transport" for r in transport_reqs)

    server_reqs = requirements_for_role("server")
    ids = [r.id for r in server_reqs]
    assert "R-29.2-a" in ids  # R-29.2-a binds the server
    assert "R-29.3-a" not in ids  # R-29.3-a (client-only) does not
    assert "R-29.1-c" in ids  # both-roles atom (empty roles) binds the server too

  def test_requirements_for_role_client_includes_both_and_client_only(self):
    client_reqs = requirements_for_role("client")
    ids = [r.id for r in client_reqs]
    assert "R-29.3-a" in ids  # client-only
    assert "R-29.1-c" in ids  # both-roles atom binds the client too
    assert "R-29.2-a" not in ids  # server-only does not bind the client

  def test_requirement_ids_are_unique(self):
    ids = [r.id for r in CONFORMANCE_REQUIREMENTS]
    assert len(ids) == len(set(ids))

  def test_every_requirement_has_known_keyword(self):
    for r in CONFORMANCE_REQUIREMENTS:
      assert r.keyword in REQUIREMENT_KEYWORDS

  def test_registry_has_exactly_76_requirements(self):
    # The §29–§30 registry mirrors the ts-sdk reference atom-for-atom (76 requirements). A
    # bare uniqueness check would not catch a dropped atom; this pins the exact count.
    assert len(CONFORMANCE_REQUIREMENTS) == 76

  def test_every_requirement_id_is_well_formed(self):
    # Every id is ``R-<section>-<suffix>`` where <section> is the §29.x / §30 number and
    # <suffix> is a lowercase letter (id-format / coverage check).
    pattern = re.compile(r"^R-(?:29\.\d+|30)-[a-z]$")
    for r in CONFORMANCE_REQUIREMENTS:
      assert pattern.match(r.id), r.id
      # The id's section segment agrees with the requirement's own ``section`` field.
      assert r.id.split("-")[1] == r.section

  def test_requirement_ids_match_golden_list(self):
    # Golden cross-check: the full ordered id list, frozen here, equals the ts-sdk
    # reference (verified out of band). A dropped, renamed, reordered, or inserted atom
    # fails loudly rather than silently drifting from the spec registry. (S45)
    assert tuple(r.id for r in CONFORMANCE_REQUIREMENTS) == _GOLDEN_REQUIREMENT_IDS


# ─── requirement-level classifier (RFC 2119 / §2) ──────────────────────────────

class TestRequirementLevelClassifier:
  def test_classifies_must_family(self):
    for kw in ["MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT"]:
      assert classify_requirement_level(kw) == "MUST"
      assert is_mandatory_keyword(kw) is True
      assert is_advisory_keyword(kw) is False
      assert is_optional_keyword(kw) is False

  def test_classifies_should_family(self):
    for kw in ["SHOULD", "SHOULD NOT", "RECOMMENDED"]:
      assert classify_requirement_level(kw) == "SHOULD"
      assert is_advisory_keyword(kw) is True
      assert is_mandatory_keyword(kw) is False
      assert is_optional_keyword(kw) is False

  def test_classifies_may_optional_family(self):
    for kw in ["MAY", "OPTIONAL"]:
      assert classify_requirement_level(kw) == "MAY"
      assert is_optional_keyword(kw) is True
      assert is_mandatory_keyword(kw) is False
      assert is_advisory_keyword(kw) is False

  def test_unrecognized_keyword_returns_none_without_raising(self):
    assert classify_requirement_level("WIBBLE") is None
    assert is_mandatory_keyword("WIBBLE") is False
    assert is_advisory_keyword("WIBBLE") is False
    assert is_optional_keyword("WIBBLE") is False

  def test_case_sensitive(self):
    # The markers use canonical UPPERCASE tokens; lowercase is not recognized.
    assert classify_requirement_level("must") is None
    assert classify_requirement_level("Should") is None

  def test_levels_strongest_first(self):
    assert REQUIREMENT_LEVELS == ("MUST", "SHOULD", "MAY")


# ─── AC-45.1 — both-role implementation must satisfy each role ──────────────────

class TestAC451BothRole:
  def test_both_role_conformant_only_if_each_role_satisfied(self):
    assert satisfies_role(["client", "server"], "client") is True
    assert satisfies_role(["client", "server"], "server") is True
    assert satisfies_role(["server"], "client") is False
    assert satisfies_role(["client"], "server") is False

  def test_empty_satisfied_set_satisfies_no_role(self):
    assert satisfies_role([], "client") is False
    assert satisfies_role([], "server") is False

  def test_requirements_for_profile_includes_both_role_baselines(self):
    profile = ConformanceProfile(
      roles=["client", "server"],
      revisions=SUPPORTED,
      capabilities=[],
      extensions=[],
      transports=["stdio"],
    )
    ids = [r.id for r in requirements_for_profile(profile)]
    assert "R-29.2-a" in ids  # server baseline
    assert "R-29.3-a" in ids  # client baseline

  def test_requirements_for_profile_server_only_excludes_client_baseline(self):
    profile = ConformanceProfile(
      roles=["server"], revisions=SUPPORTED, capabilities=[], extensions=[], transports=["stdio"]
    )
    ids = [r.id for r in requirements_for_profile(profile)]
    assert "R-29.2-a" in ids
    assert "R-29.3-a" not in ids
    # both-roles + transport atoms always apply
    assert "R-29.1-c" in ids
    assert "R-29.8-a" in ids


# ─── AC-45.2 — base message format & self-contained envelope ───────────────────

class TestAC452BaseMessageFormat:
  def test_message_format_requirements_present_and_mandatory(self):
    assert lookup_requirement("R-29.1-c").keyword == "MUST"
    assert lookup_requirement("R-29.1-d").keyword == "MUST"

  def test_well_formed_envelope_passes_and_required_keys(self):
    assert client_request_carries_baseline_envelope(baseline_meta()) is True
    assert REQUIRED_CLIENT_REQUEST_META_KEYS == (
      "io.modelcontextprotocol/protocolVersion",
      "io.modelcontextprotocol/clientInfo",
      "io.modelcontextprotocol/clientCapabilities",
    )


# ─── AC-45.3 — no state derived from connection identity ────────────────────────

class TestAC453NoConnectionState:
  def test_second_request_judged_on_own_envelope(self):
    # First request fully formed.
    assert classify_server_request(
      ServerRequestContext(meta=baseline_meta(), server_supported_revisions=SUPPORTED)
    ).ok is True
    # Second request on the "same connection" omits clientCapabilities — NOT reused.
    second = baseline_meta()
    del second[CLIENT_CAPABILITIES_META_KEY]
    disp = classify_server_request(
      ServerRequestContext(meta=second, server_supported_revisions=SUPPORTED)
    )
    assert disp.ok is False
    assert disp.stage == "envelope"

  def test_requirement_is_must_not(self):
    assert lookup_requirement("R-29.1-e").keyword == "MUST NOT"


# ─── AC-45.4 — conformance judged on wire behavior only ─────────────────────────

class TestAC454WireBehaviorOnly:
  def test_architecture_and_language_are_may(self):
    assert lookup_requirement("R-29.1-f").keyword == "MAY"
    assert lookup_requirement("R-29.9-a").keyword == "MAY"

  def test_identical_envelopes_reach_identical_dispositions(self):
    a = classify_server_request(
      ServerRequestContext(meta=baseline_meta(), server_supported_revisions=SUPPORTED)
    )
    b = classify_server_request(
      ServerRequestContext(meta=baseline_meta(), server_supported_revisions=SUPPORTED)
    )
    assert a == b


# ─── AC-45.5 / AC-45.6 — discovery unconditional; advertisement consistent ──────

class TestAC455Discovery:
  def test_discover_obligation_must_and_client_call_may(self):
    assert lookup_requirement("R-29.2-a").keyword == "MUST"
    assert lookup_requirement("R-29.2-b").keyword == "MAY"

  def test_advertise_consistency_atoms(self):
    assert lookup_requirement("R-29.2-c").keyword == "MUST"
    assert lookup_requirement("R-29.2-d").keyword == "MUST NOT"


# ─── AC-45.7 — per-request metadata honored; no cross-request state ─────────────

class TestAC457PerRequestMetadata:
  def test_well_formed_request_accepted(self):
    assert classify_server_request(
      ServerRequestContext(meta=baseline_meta(), server_supported_revisions=SUPPORTED)
    ).ok is True

  def test_no_cross_request_and_no_reuse_are_must_not(self):
    assert lookup_requirement("R-29.2-f").keyword == "MUST NOT"
    assert lookup_requirement("R-29.2-g").keyword == "MUST NOT"


# ─── AC-45.8 — unsupported revision rejected with -32004 ────────────────────────

class TestAC458UnsupportedRevision:
  def test_rejects_with_minus_32004_carrying_supported_and_requested(self):
    meta = baseline_meta({PROTOCOL_VERSION_META_KEY: "2025-01-01"})
    disp = classify_server_request(
      ServerRequestContext(meta=meta, server_supported_revisions=SUPPORTED)
    )
    assert disp.ok is False
    assert disp.stage == "revision"
    assert disp.code == UNSUPPORTED_PROTOCOL_VERSION_CODE
    assert disp.data["supported"] == SUPPORTED
    assert disp.data["requested"] == "2025-01-01"

  def test_malformed_non_date_version_is_envelope_failure(self):
    meta = baseline_meta({PROTOCOL_VERSION_META_KEY: "not-a-date"})
    disp = classify_server_request(
      ServerRequestContext(meta=meta, server_supported_revisions=SUPPORTED)
    )
    assert disp.ok is False
    assert disp.stage == "envelope"
    assert disp.code == INVALID_PARAMS_CODE

  def test_missing_version_is_envelope_failure_not_revision(self):
    meta = baseline_meta()
    del meta[PROTOCOL_VERSION_META_KEY]
    disp = classify_server_request(
      ServerRequestContext(meta=meta, server_supported_revisions=SUPPORTED)
    )
    assert disp.ok is False
    assert disp.stage == "envelope"

  def test_supported_includes_extra_revisions(self):
    # A server may support more than the wire value; a request for a supported
    # extra revision passes the revision gate.
    meta = baseline_meta({PROTOCOL_VERSION_META_KEY: "2025-01-01"})
    disp = classify_server_request(
      ServerRequestContext(
        meta=meta, server_supported_revisions=[CURRENT_PROTOCOL_VERSION, "2025-01-01"]
      )
    )
    assert disp.ok is True

  def test_non_string_version_is_envelope_failure(self):
    meta = baseline_meta({PROTOCOL_VERSION_META_KEY: 20250101})
    disp = classify_server_request(
      ServerRequestContext(meta=meta, server_supported_revisions=SUPPORTED)
    )
    assert disp.ok is False
    assert disp.stage == "envelope"


# ─── AC-45.9 — undeclared required capability rejected with -32003 ──────────────

class TestAC459MissingCapability:
  def test_rejects_with_minus_32003_enumerating_needed_caps(self):
    disp = classify_server_request(
      ServerRequestContext(
        meta=baseline_meta(),
        server_supported_revisions=SUPPORTED,
        required_client_capabilities={"elicitation": {}},
      )
    )
    assert disp.ok is False
    assert disp.stage == "capability"
    assert disp.code == MISSING_CLIENT_CAPABILITY_CODE
    assert disp.data["requiredCapabilities"] == {"elicitation": {}}

  def test_accepts_when_required_capability_declared(self):
    meta = baseline_meta({CLIENT_CAPABILITIES_META_KEY: {"elicitation": {}}})
    disp = classify_server_request(
      ServerRequestContext(
        meta=meta,
        server_supported_revisions=SUPPORTED,
        required_client_capabilities={"elicitation": {}},
      )
    )
    assert disp.ok is True

  def test_only_missing_subset_is_reported(self):
    meta = baseline_meta({CLIENT_CAPABILITIES_META_KEY: {"elicitation": {}}})
    disp = classify_server_request(
      ServerRequestContext(
        meta=meta,
        server_supported_revisions=SUPPORTED,
        required_client_capabilities={"elicitation": {}, "roots": {}},
      )
    )
    assert disp.ok is False
    assert disp.stage == "capability"
    assert disp.data["requiredCapabilities"] == {"roots": {}}

  def test_capability_check_runs_after_envelope_check(self):
    # An envelope failure pre-empts the capability check (ordering).
    meta = baseline_meta()
    del meta[CLIENT_INFO_META_KEY]
    disp = classify_server_request(
      ServerRequestContext(
        meta=meta,
        server_supported_revisions=SUPPORTED,
        required_client_capabilities={"elicitation": {}},
      )
    )
    assert disp.stage == "envelope"


# ─── AC-45.10 — omitted §4-required field rejected with -32602 ──────────────────

class TestAC4510MalformedEnvelope:
  def test_rejects_with_minus_32602_when_required_field_omitted(self):
    meta = baseline_meta()
    del meta[CLIENT_INFO_META_KEY]
    disp = classify_server_request(
      ServerRequestContext(meta=meta, server_supported_revisions=SUPPORTED)
    )
    assert disp.ok is False
    assert disp.stage == "envelope"
    assert disp.code == INVALID_PARAMS_CODE


# ─── AC-45.11 — resultType present and drawn from the advertised set ────────────

class TestAC4511SuccessResultType:
  def test_accepts_core_result_type(self):
    v = validate_success_result_type({"resultType": RESULT_TYPE_COMPLETE})
    assert v.ok is True
    assert v.result_type == "complete"
    assert validate_success_result_type({"resultType": RESULT_TYPE_INPUT_REQUIRED}).ok is True

  def test_rejects_missing_discriminator(self):
    v = validate_success_result_type({"content": []})
    assert v.ok is False
    assert v.reason == "missing"
    assert v.result_type is None

  def test_non_advertised_extension_value_rejected_advertised_accepted(self):
    contributions = {"com.example/ext": ["streamed"]}
    not_adv = validate_success_result_type({"resultType": "streamed"}, [], contributions)
    assert not_adv.ok is False
    assert not_adv.reason == "not-advertised"
    assert not_adv.result_type == "streamed"

    adv = validate_success_result_type(
      {"resultType": "streamed"}, ["com.example/ext"], contributions
    )
    assert adv.ok is True
    assert adv.result_type == "streamed"

  def test_non_string_result_type_is_missing(self):
    v = validate_success_result_type({"resultType": 123})
    assert v.ok is False
    assert v.reason == "missing"


# ─── AC-45.12 — unadvertised feature is gated/refused ───────────────────────────

class TestAC4512Gating:
  def test_refuses_unadvertised_feature(self):
    disp = classify_server_request(
      ServerRequestContext(
        meta=baseline_meta(), server_supported_revisions=SUPPORTED, feature_advertised=False
      )
    )
    assert disp.ok is False
    assert disp.stage == "gating"
    assert disp.reason == "not-advertised"

  def test_allows_advertised_feature(self):
    assert classify_server_request(
      ServerRequestContext(
        meta=baseline_meta(), server_supported_revisions=SUPPORTED, feature_advertised=True
      )
    ).ok is True

  def test_no_feature_gate_when_unspecified(self):
    # feature_advertised left as None ⇒ no gate evaluated ⇒ accepted.
    assert classify_server_request(
      ServerRequestContext(meta=baseline_meta(), server_supported_revisions=SUPPORTED)
    ).ok is True


# ─── AC-45.13 — client request carries revision, identity, capabilities ─────────

class TestAC4513ClientEnvelope:
  def test_all_three_keys_present_is_conformant(self):
    assert client_request_carries_baseline_envelope(baseline_meta()) is True

  def test_any_missing_required_key_is_non_conformant(self):
    for key in REQUIRED_CLIENT_REQUEST_META_KEYS:
      meta = baseline_meta()
      del meta[key]
      assert client_request_carries_baseline_envelope(meta) is False


# ─── AC-45.14 — revision selection & -32004 retry ───────────────────────────────

class TestAC4514RevisionSelection:
  def test_levels(self):
    assert lookup_requirement("R-29.3-b").keyword == "MUST"
    assert lookup_requirement("R-29.3-c").keyword == "SHOULD"


# ─── AC-45.15 — opacity handling ────────────────────────────────────────────────

class TestAC4515Opacity:
  def test_opacity_atoms_have_right_levels(self):
    assert lookup_requirement("R-29.3-d").keyword == "MUST"
    assert lookup_requirement("R-29.3-e").keyword == "MUST NOT"
    assert lookup_requirement("R-29.3-f").keyword == "MUST"


# ─── AC-45.16 / AC-45.17 — input_required fulfillment and retry shape ───────────

class TestAC4516InputRequiredRetry:
  def test_levels(self):
    assert lookup_requirement("R-29.3-g").keyword == "MUST"
    assert lookup_requirement("R-29.3-h").keyword == "MUST"
    assert lookup_requirement("R-29.3-i").keyword == "MAY"

  def test_retry_distinct_id_echoes_state_exactly(self):
    v = validate_input_required_retry(
      original_id="req-3", retry_id="req-3-retry", provided_state="OPAQUE", retry_state="OPAQUE"
    )
    assert v.ok is True
    assert v.reason is None

  def test_reusing_original_id_rejected(self):
    v = validate_input_required_retry(original_id=7, retry_id=7)
    assert v.ok is False
    assert v.reason == "reused-id"

  def test_changed_state_rejected(self):
    v = validate_input_required_retry(
      original_id="a", retry_id="b", provided_state="X", retry_state="Y"
    )
    assert v.ok is False
    assert v.reason == "state-mismatch"

  def test_unexpected_state_rejected_and_omitting_ok(self):
    unexpected = validate_input_required_retry(original_id="a", retry_id="b", retry_state="X")
    assert unexpected.ok is False
    assert unexpected.reason == "unexpected-state"

    omitted = validate_input_required_retry(original_id="a", retry_id="b")
    assert omitted.ok is True

  def test_provided_state_omitted_in_retry_is_state_mismatch(self):
    # Server provided a state but the retry omitted it → must echo → mismatch.
    v = validate_input_required_retry(original_id="a", retry_id="b", provided_state="X")
    assert v.ok is False
    assert v.reason == "state-mismatch"

  def test_reused_id_takes_precedence_over_state_checks(self):
    v = validate_input_required_retry(
      original_id="a", retry_id="a", provided_state="X", retry_state="Y"
    )
    assert v.reason == "reused-id"

  def test_empty_string_state_is_a_provided_value(self):
    # An empty string is a distinct provided value (not "absent") and must be echoed.
    ok = validate_input_required_retry(
      original_id="a", retry_id="b", provided_state="", retry_state=""
    )
    assert ok.ok is True
    mismatch = validate_input_required_retry(
      original_id="a", retry_id="b", provided_state="", retry_state="X"
    )
    assert mismatch.reason == "state-mismatch"


# ─── AC-45.18 — client routes by resultType with robustness ─────────────────────

class TestAC4518ClientRouting:
  def test_level(self):
    assert lookup_requirement("R-29.3-k").keyword == "MUST"

  def test_core_result_type_acted_upon(self):
    d = decide_result_action({"resultType": "complete"})
    assert d.act is True
    assert d.result_type == "complete"


# ─── AC-45.19 / AC-45.21 — capability-conditioned obligations ───────────────────

class TestAC4519CapabilityObligations:
  def test_per_capability_obligation_maps_to_feature_section(self):
    assert obligation_for_capability("tools").section == "16"
    assert obligation_for_capability("resources").section == "17"
    assert obligation_for_capability("prompts").section == "18"
    assert obligation_for_capability("completions").section == "19"
    assert obligation_for_capability("elicitation").section == "20"

  def test_resource_subscriptions_additionally_bind_section_10(self):
    obligation = obligation_for_capability("resources.subscribe")
    assert obligation.section == "17"
    assert "10" in obligation.additional_sections

  def test_obliged_sections_aggregates_and_deduplicates(self):
    assert obliged_sections_for_capabilities(
      ["tools", "resources.subscribe", "completions"]
    ) == ["10", "16", "17", "19"]

  def test_obliged_sections_ignores_unknown_capabilities(self):
    assert obliged_sections_for_capabilities(["tools", "com.example/unknown"]) == ["16"]
    assert obliged_sections_for_capabilities([]) == []

  def test_elicitation_is_client_obligation(self):
    assert obligation_for_capability("elicitation").party == "client"
    tools = next(o for o in CAPABILITY_OBLIGATIONS if o.capability == "tools")
    assert tools.party == "server"

  def test_unknown_capability_has_no_obligation(self):
    assert obligation_for_capability("nonsense") is None

  def test_advertising_binds_full_must_level_conformance(self):
    assert lookup_requirement("R-29.4-a").keyword == "MUST"
    assert lookup_requirement("R-29.4-j").keyword == "MUST NOT"

  def test_requirements_for_profile_includes_capability_atom_only_when_advertised(self):
    with_tools = ConformanceProfile(
      roles=["server"],
      revisions=SUPPORTED,
      capabilities=["tools"],
      extensions=[],
      transports=["stdio"],
    )
    without = ConformanceProfile(
      roles=["server"], revisions=SUPPORTED, capabilities=[], extensions=[], transports=["stdio"]
    )
    assert "R-29.4-b" in [r.id for r in requirements_for_profile(with_tools)]
    assert "R-29.4-b" not in [r.id for r in requirements_for_profile(without)]

  def test_requirements_for_profile_unconditional_29_4_atoms_always_present(self):
    # Atoms not guarded by a specific capability (e.g. R-29.4-a) always apply.
    profile = ConformanceProfile(
      roles=["server"], revisions=SUPPORTED, capabilities=[], extensions=[], transports=["stdio"]
    )
    ids = [r.id for r in requirements_for_profile(profile)]
    assert "R-29.4-a" in ids
    assert "R-29.4-h" in ids

  def test_requirements_for_profile_elicitation_atom_client_gated(self):
    client_with_elicit = ConformanceProfile(
      roles=["client"],
      revisions=SUPPORTED,
      capabilities=["elicitation"],
      extensions=[],
      transports=["stdio"],
    )
    client_without = ConformanceProfile(
      roles=["client"], revisions=SUPPORTED, capabilities=[], extensions=[], transports=["stdio"]
    )
    assert "R-29.4-f" in [r.id for r in requirements_for_profile(client_with_elicit)]
    assert "R-29.4-f" not in [r.id for r in requirements_for_profile(client_without)]


# ─── AC-45.20 — never depend on an unadvertised feature ─────────────────────────

class TestAC4520NoUnadvertisedDependence:
  def test_levels(self):
    assert lookup_requirement("R-29.4-h").keyword == "MUST NOT"
    assert lookup_requirement("R-29.4-i").keyword == "MUST NOT"


# ─── AC-45.22 — no unsolicited input request of an undeclared kind ──────────────

class TestAC4522NoUnsolicitedInput:
  def test_elicitation_input_request_requires_declared_capability(self):
    assert may_place_input_request("elicitation/create", {}) is False
    assert may_place_input_request("elicitation/create", {"elicitation": {}}) is True

  def test_gating_capability_map_covers_three_kinds(self):
    assert INPUT_REQUEST_REQUIRED_CAPABILITY["elicitation/create"] == "elicitation"
    assert INPUT_REQUEST_REQUIRED_CAPABILITY["roots/list"] == "roots"
    assert INPUT_REQUEST_REQUIRED_CAPABILITY["sampling/createMessage"] == "sampling"

  def test_unrecognized_kind_never_placeable(self):
    assert may_place_input_request("unknown/kind", {"unknown": {}}) is False

  def test_recognized_kind_with_wrong_capability_not_placeable(self):
    # roots/list requires "roots", not "elicitation".
    assert may_place_input_request("roots/list", {"elicitation": {}}) is False
    assert may_place_input_request("roots/list", {"roots": {}}) is True

  def test_sampling_kind(self):
    assert may_place_input_request("sampling/createMessage", {}) is False
    assert may_place_input_request("sampling/createMessage", {"sampling": {}}) is True


# ─── AC-45.23 — deprecated client-provided capabilities are bidirectional ───────

class TestAC4523DeprecatedBidirectional:
  def test_levels(self):
    assert lookup_requirement("R-29.4-m").keyword == "MUST"
    assert lookup_requirement("R-29.4-n").keyword == "MUST NOT"


# ─── AC-45.24/25/26 — optionality of extensions and deprecated features ─────────

class TestAC4524Optionality:
  def test_zero_extensions_is_fully_conformant(self):
    assert lookup_requirement("R-29.5-a").keyword == "OPTIONAL"
    profile = ConformanceProfile(
      roles=["server"], revisions=SUPPORTED, capabilities=[], extensions=[], transports=["stdio"]
    )
    v = validate_conformance_profile(profile)
    assert v.ok is True
    assert v.violations == []

  def test_advertised_extension_must_be_well_formed_and_implement(self):
    assert lookup_requirement("R-29.5-b").keyword == "MUST"
    assert lookup_requirement("R-29.5-c").keyword == "MUST"
    assert lookup_requirement("R-29.5-d").keyword == "MUST"
    bad = ConformanceProfile(
      roles=["server"],
      revisions=SUPPORTED,
      capabilities=[],
      extensions=["not a valid id"],
      transports=["stdio"],
    )
    v = validate_conformance_profile(bad)
    assert v.ok is False
    assert any(x.field == "extensions" for x in v.violations)

  def test_well_formed_extension_id_accepted(self):
    profile = ConformanceProfile(
      roles=["server"],
      revisions=SUPPORTED,
      capabilities=[],
      extensions=["com.example/myext"],
      transports=["stdio"],
    )
    assert validate_conformance_profile(profile).ok is True

  def test_deprecated_features_optional_but_full_when_implemented(self):
    assert lookup_requirement("R-29.5-e").keyword == "OPTIONAL"
    assert lookup_requirement("R-29.5-f").keyword == "MUST"
    partial = is_feature_fully_conformant(True, False)
    assert partial.ok is False
    assert partial.reason == "advertised-not-implemented"
    assert is_feature_fully_conformant(True, True).ok is True
    assert is_feature_fully_conformant(False, False).ok is True
    assert is_feature_fully_conformant(False, True).ok is True


# ─── AC-45.27 — robustness: ignore the unrecognized ─────────────────────────────

class TestAC4527RobustnessIgnore:
  def test_unknown_field_capability_extension_ignored(self):
    assert robustness_disposition("field", False) == "ignore"
    assert robustness_disposition("capability", False) == "ignore"
    assert robustness_disposition("extension", False) == "ignore"

  def test_recognized_element_accepted(self):
    assert robustness_disposition("field", True) == "accept"
    assert robustness_disposition("capability", True) == "accept"
    assert robustness_disposition("extension", True) == "accept"
    assert robustness_disposition("result-type", True) == "accept"
    assert robustness_disposition("error-code", True) == "accept"


# ─── AC-45.28 — unknown error code is a request failure ─────────────────────────

class TestAC4528UnknownErrorCode:
  def test_unknown_error_code_is_failed_request(self):
    assert robustness_disposition("error-code", False) == "fail-request"
    assert lookup_requirement("R-29.6-e").keyword == "MUST"


# ─── AC-45.29 — unrecognized / absent resultType handling ───────────────────────

class TestAC4529ResultTypeHandling:
  def test_unrecognized_result_type_treated_as_error(self):
    assert robustness_disposition("result-type", False) == "treat-as-error"
    d = decide_result_action({"resultType": "wibble"})
    assert d.act is False
    assert d.reason == "unrecognized"
    assert d.result_type == "wibble"

  def test_absent_discriminator_applies_section_3_absence_rule(self):
    d = decide_result_action({"content": []})
    assert d.act is True
    assert d.result_type == "complete"

  def test_null_discriminator_applies_absence_rule(self):
    d = decide_result_action({"resultType": None})
    assert d.act is True
    assert d.result_type == "complete"

  def test_active_extension_value_acted_upon(self):
    contributions = {"com.example/ext": ["streamed"]}
    d = decide_result_action({"resultType": "streamed"}, ["com.example/ext"], contributions)
    assert d.act is True
    assert d.result_type == "streamed"

  def test_core_input_required_acted_upon(self):
    d = decide_result_action({"resultType": "input_required"})
    assert d.act is True
    assert d.result_type == "input_required"


# ─── AC-45.30 — robustness never discards understood content ────────────────────

class TestAC4530NeverDiscardUnderstood:
  def test_must_not_and_recognized_always_accepted(self):
    assert lookup_requirement("R-29.6-i").keyword == "MUST NOT"
    assert robustness_disposition("field", True) == "accept"


# ─── AC-45.31 / AC-45.32 — stateless invariants ─────────────────────────────────

class TestAC4531StatelessInvariants:
  def test_independent_requests_and_explicit_state(self):
    assert STATELESS_CONFORMANCE_INVARIANTS["independentRequests"] is True
    assert STATELESS_CONFORMANCE_INVARIANTS["explicitCrossRequestState"] is True
    assert lookup_requirement("R-29.7-a").keyword == "MUST"
    assert lookup_requirement("R-29.7-b").keyword == "MUST"

  def test_connection_is_not_lifetime_boundary(self):
    assert STATELESS_CONFORMANCE_INVARIANTS["connectionIsNotLifetimeBoundary"] is True
    assert lookup_requirement("R-29.7-c").keyword == "MUST NOT"

  def test_all_invariants_true(self):
    assert all(STATELESS_CONFORMANCE_INVARIANTS.values())


# ─── AC-45.33 — requestState integrity protection ───────────────────────────────

class TestAC4533RequestStateIntegrity:
  def test_security_significant_tampered_value_rejected(self):
    d = decide_request_state_handling(True, False)
    assert d.trust == "untrusted"
    assert d.action == "reject"

  def test_security_significant_verified_value_accepted(self):
    d = decide_request_state_handling(True, True)
    assert d.trust == "untrusted"
    assert d.action == "accept"

  def test_non_significant_always_untrusted_but_accepted(self):
    d = decide_request_state_handling(False, False)
    assert d.trust == "untrusted"
    assert d.action == "accept"
    assert decide_request_state_handling(False, True).action == "accept"

  def test_invariants_flags(self):
    assert STATELESS_CONFORMANCE_INVARIANTS["requestStateIsUntrusted"] is True
    assert STATELESS_CONFORMANCE_INVARIANTS["requestStateIntegrityProtected"] is True


# ─── AC-45.34 / AC-45.35 — transport conformance & error mapping ────────────────

class TestAC4534TransportConformance:
  def test_at_least_one_transport_required(self):
    assert lookup_requirement("R-29.8-a").keyword == "MUST"
    assert lookup_requirement("R-29.8-b").keyword == "MUST"
    no_transport = ConformanceProfile(
      roles=["server"], revisions=SUPPORTED, capabilities=[], extensions=[], transports=[]
    )
    v = validate_conformance_profile(no_transport)
    assert v.ok is False
    assert any(x.field == "transports" for x in v.violations)

  def test_streamable_http_error_mapping(self):
    assert (
      streamable_http_status_for_protocol_error(INVALID_PARAMS_CODE)
      == STREAMABLE_HTTP_NEGOTIATION_ERROR_STATUS
    )
    assert streamable_http_status_for_protocol_error(MISSING_CLIENT_CAPABILITY_CODE) == 400
    assert streamable_http_status_for_protocol_error(-32601) is None

  def test_unrelated_codes_not_pinned(self):
    assert streamable_http_status_for_protocol_error(UNSUPPORTED_PROTOCOL_VERSION_CODE) is None
    assert streamable_http_status_for_protocol_error(0) is None


# ─── AC-45.36 / AC-45.37 — authorization applicability & independence ───────────

class TestAC4536AuthorizationApplicability:
  def test_http_conforms_stdio_does_not_apply(self):
    http = evaluate_transport_conformance("streamable-http")
    assert http.authorization_applies is True
    assert http.authorization_forbidden is False
    assert http.credential_conveyance == "bearer"

    stdio = evaluate_transport_conformance("stdio")
    assert stdio.authorization_applies is False
    assert stdio.authorization_forbidden is True
    assert stdio.credential_conveyance == "environment"

    assert lookup_requirement("R-29.8-d").keyword == "SHOULD"
    assert lookup_requirement("R-29.8-e").keyword == "SHOULD NOT"

  def test_http_alias_resolves_to_http_family(self):
    http = evaluate_transport_conformance("http")
    assert http.authorization_applies is True
    assert http.credential_conveyance == "bearer"

  def test_other_transport_best_practice(self):
    other = evaluate_transport_conformance("com.example/quic")
    assert other.authorization_applies is False
    assert other.authorization_forbidden is False
    assert other.credential_conveyance == "best-practice"

  def test_transport_independence_and_concurrency(self):
    assert lookup_requirement("R-29.8-f").keyword == "MUST NOT"
    assert lookup_requirement("R-29.8-g").keyword == "MAY"
    a = evaluate_transport_conformance("stdio")
    b = evaluate_transport_conformance("streamable-http")
    assert a.transport == "stdio"
    assert b.transport == "streamable-http"


# ─── AC-45.38 — no partial conformance; exact registry values ───────────────────

class TestAC4538NoPartialConformance:
  def test_no_advertised_but_partially_implemented(self):
    assert lookup_requirement("R-29.9-b").keyword == "MUST"
    assert is_feature_fully_conformant(True, False).ok is False

  def test_exact_appendix_values_required(self):
    assert lookup_requirement("R-29.9-c").keyword == "MUST"

  def test_profile_must_include_wire_revision_and_supports_it(self):
    profile = ConformanceProfile(
      roles=["server"], revisions=SUPPORTED, capabilities=[], extensions=[], transports=["stdio"]
    )
    assert validate_conformance_profile(profile).ok is True
    assert profile_supports_revision(profile, CURRENT_PROTOCOL_VERSION) is True

    missing_wire = ConformanceProfile(
      roles=["server"], revisions=["2025-01-01"], capabilities=[], extensions=[], transports=["stdio"]
    )
    v = validate_conformance_profile(missing_wire)
    assert v.ok is False
    assert any(x.field == "revisions" for x in v.violations)

  def test_profile_supports_advertised_extra_revision(self):
    profile = ConformanceProfile(
      roles=["server"],
      revisions=[CURRENT_PROTOCOL_VERSION, "2025-01-01"],
      capabilities=[],
      extensions=[],
      transports=["stdio"],
    )
    assert profile_supports_revision(profile, "2025-01-01") is True
    assert profile_supports_revision(profile, "1999-12-31") is False

  def test_empty_roles_and_transports_accumulate_violations(self):
    profile = ConformanceProfile(
      roles=[], revisions=[], capabilities=[], extensions=[], transports=[]
    )
    v = validate_conformance_profile(profile)
    assert v.ok is False
    fields = {x.field for x in v.violations}
    assert "roles" in fields
    assert "revisions" in fields
    assert "transports" in fields

  def test_unrecognized_role_is_a_violation(self):
    profile = ConformanceProfile(
      roles=["proxy"], revisions=SUPPORTED, capabilities=[], extensions=[], transports=["stdio"]
    )
    v = validate_conformance_profile(profile)
    assert v.ok is False
    assert any(x.field == "roles" for x in v.violations)

  def test_unrecognized_capability_is_not_a_profile_error(self):
    # Robustness (R-29.6-c) tolerates unknown capabilities; not a profile violation.
    profile = ConformanceProfile(
      roles=["server"],
      revisions=SUPPORTED,
      capabilities=["com.example/unknown"],
      extensions=[],
      transports=["stdio"],
    )
    assert validate_conformance_profile(profile).ok is True


# ─── AC-45.39 — §30 citations are provenance-only ───────────────────────────────

class TestAC4539CitationsProvenanceOnly:
  def test_no_citation_marker_is_load_bearing(self):
    assert CITATION_STATUS["loadBearing"] is False
    assert CITATION_STATUS["selfContained"] is True
    assert is_citation_load_bearing("[MCP-Versioning]") is False
    assert is_citation_load_bearing("[RFC8174]") is False
    assert is_citation_load_bearing("anything-at-all") is False
    assert is_citation_load_bearing("") is False
    assert lookup_requirement("R-30-a").keyword == "MAY"


# ─── §27 — Feature lifecycle status (mcp.protocol.conformance) ──────────────────

class TestFeatureStatus:
  def test_status_constants(self):
    assert FEATURE_STATUS_ACTIVE == "active"
    assert FEATURE_STATUS_DEPRECATED == "deprecated"
    assert FeatureStatus.Active == "active"
    assert FeatureStatus.Deprecated == "deprecated"

  def test_statuses_tuple_in_order(self):
    assert FEATURE_STATUSES == ("active", "deprecated")

  def test_is_feature_status(self):
    assert is_feature_status("active") is True
    assert is_feature_status("deprecated") is True
    assert is_feature_status("retired") is False
    assert is_feature_status(None) is False
    assert is_feature_status(0) is False
