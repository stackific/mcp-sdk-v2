"""Tests for S38 — The Extension Mechanism (§24).

Mirrors ``ts-sdk/src/__tests__/protocol/extension-mechanism.test.ts``, one or more cases
per numbered acceptance criterion (AC-38.1 – AC-38.43).
"""

import pytest

from mcp.jsonrpc.payload import RESULT_TYPE_COMPLETE, RESULT_TYPE_INPUT_REQUIRED
from mcp.protocol.errors import MISSING_CLIENT_CAPABILITY_CODE
from mcp.protocol.extension_mechanism import (
  CORE_RESULT_TYPE_VALUES,
  EXTENSION_CLASSIFICATIONS,
  EXTENSION_SURFACE_CHANNELS,
  REQUIRED_EXTENSION_ABSENT_CODE,
  ExtensionDefinition,
  ExtensionMethodRouter,
  accepted_result_types,
  active_set_for_request,
  build_required_extension_error,
  compute_active_set,
  decide_extension_use,
  derive_extension_namespace,
  extension_ids_match,
  extension_meta_key,
  extension_method,
  get_extension_version,
  is_extension_classification,
  is_extension_controlled_meta_key,
  is_incompatible_change,
  is_method_in_extension_namespace,
  is_reserved_bare_vendor_prefix,
  is_result_type_accepted,
  is_sanctioned_surface_channel,
  is_valid_third_party_extension_id,
  may_emit_extension_surface,
  reconcile_extension_settings,
  suggest_successor_identifier,
  validate_extension_definition,
  validate_third_party_extension_id,
)


# ─── AC-38.1 — framework conformance of an extension definition ────────────────


class TestFrameworkConformance:
  def test_accepts_conforming_definition(self):
    result = validate_extension_definition(
      ExtensionDefinition(
        identifier="com.example/my-extension",
        classification="modular",
        methods=("my-extension/get",),
        meta_keys=("com.example/trace",),
        result_types=("com.example.partial",),
        fields=("Tool.x",),
      )
    )
    assert result.ok is True

  def test_rejects_non_conforming_definition(self):
    result = validate_extension_definition(
      ExtensionDefinition(
        identifier="com.example/my-extension",
        methods=("tasks/get",),  # not under my-extension/
        meta_keys=("org.other/key",),  # not controlled by com.example
        result_types=("complete",),  # redefines core
      )
    )
    assert result.ok is False
    channels = sorted(v.channel for v in result.violations)
    assert "method" in channels
    assert "meta-key" in channels
    assert "result-type" in channels

  def test_rejects_malformed_identifier_and_stops(self):
    result = validate_extension_definition(
      ExtensionDefinition(identifier="no-slash", methods=("x/y",))
    )
    assert result.ok is False
    assert len(result.violations) == 1
    assert result.violations[0].channel == "identifier"

  def test_rejects_unknown_classification(self):
    result = validate_extension_definition(
      ExtensionDefinition(identifier="com.example/x", classification="bogus")
    )
    assert result.ok is False
    assert any(v.channel == "identifier" for v in result.violations)


# ─── AC-38.2 — classifiable; zero-extension still conformant ───────────────────


class TestClassification:
  def test_classifies_modular_specialized_experimental(self):
    assert EXTENSION_CLASSIFICATIONS == ("modular", "specialized", "experimental")
    for c in EXTENSION_CLASSIFICATIONS:
      assert is_extension_classification(c) is True
    assert is_extension_classification("other") is False

  def test_zero_extensions_is_valid(self):
    assert compute_active_set({}, {}) == []
    assert compute_active_set(None, None) == []


# ─── AC-38.3 — N>1 extensions negotiated independently ─────────────────────────


class TestMultipleExtensionsIndependent:
  def test_intersects_each_identifier_independently(self):
    client = {"com.example/a": {}, "com.example/b": {}, "com.example/c": {}}
    server = {"com.example/b": {}, "com.example/c": {}, "com.example/d": {}}
    assert compute_active_set(client, server) == ["com.example/b", "com.example/c"]


# ─── AC-38.4 — disabled by default ─────────────────────────────────────────────


class TestDisabledByDefault:
  def test_not_negotiated_is_not_active(self):
    active = compute_active_set({"com.example/x": {}}, {"com.example/y": {}})
    assert may_emit_extension_surface("com.example/x", active) is False


# ─── AC-38.5 — surface outside the mechanism flagged non-conformant ────────────


class TestSurfaceChannels:
  def test_only_four_channels_sanctioned(self):
    assert EXTENSION_SURFACE_CHANNELS == ("method", "meta-key", "result-type", "field")
    assert is_sanctioned_surface_channel("method") is True
    assert is_sanctioned_surface_channel("header") is False

  def test_flags_method_and_result_type_outside_namespace(self):
    r = validate_extension_definition(
      ExtensionDefinition(
        identifier="com.example/x",
        methods=("rogue/method",),
        result_types=("input_required",),
      )
    )
    assert r.ok is False


# ─── AC-38.6 — bare name (no prefix) rejected ──────────────────────────────────


class TestMissingVendorPrefix:
  def test_rejects_bare_name(self):
    assert is_valid_third_party_extension_id("myextension") is False
    v = validate_third_party_extension_id("myextension")
    assert v.ok is False
    assert v.reason == "missing-prefix"

  def test_rejects_empty_prefix(self):
    v = validate_third_party_extension_id("/x")
    assert v.ok is False
    assert v.reason == "missing-prefix"


# ─── AC-38.7 — label start/end rules ───────────────────────────────────────────


class TestPrefixLabelGrammar:
  def test_rejects_bad_label_boundaries(self):
    assert is_valid_third_party_extension_id("1com.example/x") is False
    assert is_valid_third_party_extension_id("com.example-/x") is False

  def test_accepts_a_b1_label(self):
    assert is_valid_third_party_extension_id("a-b1.example/x") is True

  def test_malformed_reason(self):
    assert validate_third_party_extension_id("1com.example/x").reason == "malformed"


# ─── AC-38.8 — reverse-DNS guidance ────────────────────────────────────────────


class TestReverseDns:
  def test_accepts_reverse_dns(self):
    assert is_valid_third_party_extension_id("com.example/x") is True


# ─── AC-38.9 — extension-name grammar ──────────────────────────────────────────


class TestNameGrammar:
  def test_rejects_bad_names(self):
    assert is_valid_third_party_extension_id("com.example/-bad") is False
    assert is_valid_third_party_extension_id("com.example/bad-") is False
    assert is_valid_third_party_extension_id("com.example/has space") is False

  def test_accepts_my_extension_and_a(self):
    assert is_valid_third_party_extension_id("com.example/my-extension") is True
    assert is_valid_third_party_extension_id("com.example/a") is True


# ─── AC-38.10 — reserved second-label prefixes rejected ────────────────────────


class TestReservedSecondLabel:
  def test_rejects_reserved_second_label(self):
    assert validate_third_party_extension_id("io.modelcontextprotocol/x").reason == "reserved-prefix"
    assert validate_third_party_extension_id("com.mcp.tools/x").reason == "reserved-prefix"

  def test_accepts_com_example_mcp(self):
    assert is_valid_third_party_extension_id("com.example.mcp/x") is True


# ─── AC-38.11 — bare reserved token prefixes rejected ──────────────────────────


class TestBareReservedToken:
  def test_rejects_bare_tokens(self):
    assert is_reserved_bare_vendor_prefix("modelcontextprotocol") is True
    assert is_reserved_bare_vendor_prefix("mcp") is True
    assert validate_third_party_extension_id("modelcontextprotocol/x").reason == "reserved-bare-token"
    assert validate_third_party_extension_id("mcp/x").reason == "reserved-bare-token"

  def test_non_reserved_single_label_ok(self):
    assert is_reserved_bare_vendor_prefix("com") is False


# ─── AC-38.12 — case-sensitivity / octet-for-octet ─────────────────────────────


class TestCaseSensitiveMatching:
  def test_distinct_when_case_differs(self):
    assert extension_ids_match("Com.Example/Ext", "com.example/ext") is False
    assert extension_ids_match("com.example/ext", "com.example/ext") is True

  def test_active_set_no_case_folding(self):
    active = compute_active_set({"Com.Example/Ext": {}}, {"com.example/ext": {}})
    assert active == []


# ─── AC-38.13 — absent/empty extensions => no extensions ───────────────────────


class TestAbsentOrEmpty:
  def test_absence_or_empty_is_no_extensions(self):
    assert compute_active_set({"com.example/a": {}}, {}) == []
    assert compute_active_set({"com.example/a": {}}, None) == []


# ─── AC-38.14 — produced maps carry no null values ─────────────────────────────


class TestNoNullInProducedMap:
  def test_empty_object_for_enabled_no_settings(self):
    produced_value: dict = {}
    assert produced_value is not None
    assert compute_active_set(
      {"com.example/a": produced_value}, {"com.example/a": {}}
    ) == ["com.example/a"]


# ─── AC-38.15 — null value => malformed, not activated ─────────────────────────


class TestNullValueNotActivated:
  def test_null_on_either_side_not_active(self):
    assert compute_active_set({"com.example/broken": None}, {"com.example/broken": {}}) == []
    assert compute_active_set({"com.example/broken": {}}, {"com.example/broken": None}) == []


# ─── AC-38.16 — one-sided extension not used ───────────────────────────────────


class TestActiveSetIsIntersection:
  def test_one_sided_extension_not_active(self):
    active = compute_active_set({"com.example/only-client": {}}, {"com.example/other": {}})
    assert "com.example/only-client" not in active
    assert may_emit_extension_surface("com.example/only-client", active) is False


# ─── AC-38.17 — no surface for a non-active extension ──────────────────────────


class TestNoSurfaceForNonActive:
  def test_dispatch_refused_for_non_active(self):
    router = ExtensionMethodRouter()
    router.register("com.example/x", "x/do", lambda params: "ran")
    out = router.dispatch("x/do", {}, [])
    assert out.ok is False
    assert out.reason == "extension-inactive"

  def test_non_active_may_not_emit_method_or_result_type(self):
    active = []
    assert may_emit_extension_surface("com.example/x", active) is False
    assert (
      is_result_type_accepted(
        "com.example.partial", active, {"com.example/x": ["com.example.partial"]}
      )
      is False
    )


# ─── AC-38.18 — receiver may reject-with-core-error or ignore ──────────────────


class TestReceiverHandling:
  def test_dispatch_surfaces_core_error_code(self):
    router = ExtensionMethodRouter()
    router.register("com.example/x", "x/do", lambda params: 1)
    out = router.dispatch("x/do", {}, [])
    assert out.ok is False
    assert out.code == -32602  # INVALID_PARAMS_CODE — caller MAY reject (R-24.3-f)

  def test_unknown_method_also_core_error_code(self):
    router = ExtensionMethodRouter()
    out = router.dispatch("never/registered", {}, [])
    assert out.ok is False
    assert out.reason == "unknown-method"
    assert out.code == -32602


# ─── AC-38.19 — reconcile both sides' settings ─────────────────────────────────


class TestSettingsReconciliation:
  def test_returns_both_settings_when_active_on_both(self):
    client = {"com.example/x": {"mimeTypes": ["a", "b"]}}
    server = {"com.example/x": {"mimeTypes": ["b", "c"]}}
    r = reconcile_extension_settings(client, server, "com.example/x")
    assert r is not None
    assert r.client == {"mimeTypes": ["a", "b"]}
    assert r.server == {"mimeTypes": ["b", "c"]}

  def test_returns_none_when_one_side(self):
    assert reconcile_extension_settings({"com.example/x": {}}, {}, "com.example/x") is None


# ─── AC-38.20 — per-request recomputation ──────────────────────────────────────


class TestPerRequestRecomputation:
  def test_computes_from_request_capabilities(self):
    server = {"com.example/x": {}}
    assert active_set_for_request({"com.example/x": {}}, server) == ["com.example/x"]
    assert active_set_for_request({}, server) == []


# ─── AC-38.21 — no inference from a prior request ──────────────────────────────


class TestStatelessNoInference:
  def test_request_b_independent_of_request_a(self):
    server = {"com.example/x": {}}
    a = active_set_for_request({"com.example/x": {}}, server)
    b = active_set_for_request({}, server)  # same connection, different request
    assert a == ["com.example/x"]
    assert b == []


# ─── AC-38.22 — unadvertised on a request => inactive ──────────────────────────


class TestUnadvertisedInactive:
  def test_serves_request_as_inactive(self):
    active = active_set_for_request({}, {"com.example/x": {}})
    assert may_emit_extension_surface("com.example/x", active) is False


# ─── AC-38.23 — only the four channels ─────────────────────────────────────────


class TestFourChannelsOnly:
  def test_enumerates_exactly_four(self):
    assert list(EXTENSION_SURFACE_CHANNELS) == ["method", "meta-key", "result-type", "field"]


# ─── AC-38.24 — method namespaced from identifier; no collisions ───────────────


class TestMethodNamespacing:
  def test_derives_namespace_and_recognizes_members(self):
    assert derive_extension_namespace("io.modelcontextprotocol/tasks") == "tasks/"
    assert is_method_in_extension_namespace("tasks/get", "io.modelcontextprotocol/tasks") is True
    assert extension_method("io.modelcontextprotocol/tasks", "get") == "tasks/get"

  def test_method_outside_namespace_does_not_match(self):
    assert is_method_in_extension_namespace("resources/read", "io.modelcontextprotocol/tasks") is False
    # empty member after the namespace prefix is not a method
    assert is_method_in_extension_namespace("tasks/", "io.modelcontextprotocol/tasks") is False

  def test_namespace_none_for_empty_name_or_malformed(self):
    assert derive_extension_namespace("com.example/") is None
    assert derive_extension_namespace("noslash") is None

  def test_extension_method_raises_for_empty_member_or_bad_id(self):
    with pytest.raises(ValueError):
      extension_method("com.example/", "get")
    with pytest.raises(ValueError):
      extension_method("io.modelcontextprotocol/tasks", "")


# ─── AC-38.25 — non-active extension's method not sent ─────────────────────────


class TestNonActiveMethodNotSent:
  def test_dispatch_gated_by_active_set(self):
    router = ExtensionMethodRouter()
    router.register("com.example/x", "x/run", lambda params: "ok")
    assert router.dispatch("x/run", {}, ["com.example/other"]).ok is False
    out = router.dispatch("x/run", {}, ["com.example/x"])
    assert out.ok is True
    assert out.result == "ok"


# ─── AC-38.26 — extension `_meta` key under controlled prefix ──────────────────


class TestControlledMetaKeys:
  def test_accepts_controlled_rejects_others(self):
    assert is_extension_controlled_meta_key("com.example/trace", "com.example/x") is True
    assert (
      is_extension_controlled_meta_key(
        "io.modelcontextprotocol/ui-data", "io.modelcontextprotocol/ui"
      )
      is True
    )
    assert is_extension_controlled_meta_key("org.other/key", "com.example/x") is False
    assert is_extension_controlled_meta_key("bareKey", "com.example/x") is False
    assert extension_meta_key("com.example/x", "trace") == "com.example/trace"

  def test_extension_meta_key_raises_for_bad_name_or_id(self):
    with pytest.raises(ValueError):
      extension_meta_key("com.example/x", "")
    with pytest.raises(ValueError):
      extension_meta_key("com.example/x", "-bad")
    with pytest.raises(ValueError):
      extension_meta_key("noslash", "trace")


# ─── AC-38.27 — accepted resultType set ────────────────────────────────────────


class TestAcceptedResultTypes:
  def test_core_plus_active_contributions(self):
    active = ["com.example/x"]
    contributions = {
      "com.example/x": ["com.example.partial"],
      "com.example/inactive": ["com.example.never"],
    }
    accepted = accepted_result_types(active, contributions)
    assert RESULT_TYPE_COMPLETE in accepted
    assert RESULT_TYPE_INPUT_REQUIRED in accepted
    assert "com.example.partial" in accepted
    assert "com.example.never" not in accepted  # inactive contributor excluded
    assert CORE_RESULT_TYPE_VALUES == ("complete", "input_required")

  def test_accepts_without_contributions_argument(self):
    assert accepted_result_types([]) == {"complete", "input_required"}

  def test_active_set_may_be_a_set(self):
    # The active set may be supplied as a set/frozenset, not only a list; the
    # membership test must work either way.
    contributions = {"com.example/x": ["com.example.partial"]}
    accepted = accepted_result_types({"com.example/x"}, contributions)
    assert "com.example.partial" in accepted
    assert may_emit_extension_surface("com.example/x", frozenset({"com.example/x"})) is True


# ─── AC-38.28 — unknown/inactive resultType invalid ────────────────────────────


class TestInvalidResultType:
  def test_neither_core_nor_active_is_invalid(self):
    assert is_result_type_accepted("complete", []) is True
    assert is_result_type_accepted("com.example.partial", []) is False
    contributions = {"com.example/x": ["com.example.partial"]}
    assert is_result_type_accepted("com.example.partial", ["com.example/x"], contributions) is True
    assert is_result_type_accepted("com.example.partial", [], contributions) is False


# ─── AC-38.29 — ignore extension-added fields when inactive ────────────────────


class TestIgnoreExtensionFieldsWhenInactive:
  def test_inactive_peer_reads_only_core_field(self):
    # The mechanism for "ignore unknown fields" is forward-compatibility: a peer for
    # which the extension is inactive simply does not read them. Assert the gate that
    # prevents reliance, then that the core field remains readable.
    active = []
    assert may_emit_extension_surface("com.example/x", active) is False
    obj = {"name": "core", "com.example/extra": "ignored-by-inactive-peer"}
    assert obj["name"] == "core"


# ─── AC-38.30 — no dependence on extension field unless active ─────────────────


class TestNoDependenceUnlessActive:
  def test_decide_use_fallback_when_inactive(self):
    assert (
      decide_extension_use(identifier="com.example/x", active_set=[], mandatory=False) == "fallback"
    )
    assert (
      decide_extension_use(
        identifier="com.example/x", active_set=["com.example/x"], mandatory=False
      )
      == "use-extension"
    )


# ─── AC-38.31 — no redefinition of core surface ────────────────────────────────


class TestNoRedefinition:
  def test_flags_core_result_type(self):
    r = validate_extension_definition(
      ExtensionDefinition(identifier="com.example/x", result_types=("complete",))
    )
    assert r.ok is False

  def test_cannot_re_register_same_method(self):
    router = ExtensionMethodRouter()
    router.register("com.example/x", "x/do", lambda params: 1)
    with pytest.raises(ValueError):
      router.register("com.example/x", "x/do", lambda params: 2)

  def test_register_rejects_misnamed_method(self):
    router = ExtensionMethodRouter()
    with pytest.raises(ValueError):
      router.register("com.example/x", "wrong/do", lambda params: 1)


# ─── AC-38.32/33 — version in the settings object only ─────────────────────────


class TestVersion:
  def test_reads_version_from_settings(self):
    assert get_extension_version({"com.example/x": {"version": "2"}}, "com.example/x") == "2"
    assert get_extension_version({"com.example/x": {"version": 2}}, "com.example/x") == "2"

  def test_undefined_when_no_version(self):
    assert get_extension_version({"com.example/x": {}}, "com.example/x") is None
    assert get_extension_version({}, "com.example/x") is None

  def test_bool_is_not_a_version(self):
    assert get_extension_version({"com.example/x": {"version": True}}, "com.example/x") is None

  def test_custom_version_key(self):
    assert (
      get_extension_version({"com.example/x": {"v": "9"}}, "com.example/x", version_key="v") == "9"
    )

  def test_integral_float_normalized_without_decimal(self):
    # JS String(2) yields "2", not "2.0"; an integral float is normalized the same way.
    assert get_extension_version({"com.example/x": {"version": 2.0}}, "com.example/x") == "2"

  def test_non_integral_float_kept(self):
    assert get_extension_version({"com.example/x": {"version": 2.5}}, "com.example/x") == "2.5"

  def test_non_finite_float_is_not_a_version(self):
    assert get_extension_version({"com.example/x": {"version": float("nan")}}, "com.example/x") is None
    assert get_extension_version({"com.example/x": {"version": float("inf")}}, "com.example/x") is None

  def test_non_advertised_or_malformed_extension_yields_none(self):
    # The extension is advertised with a null (malformed) value → not advertised → no version.
    assert get_extension_version({"com.example/x": None}, "com.example/x") is None
    # A non-string/number version (e.g. a list) is not a version marker.
    assert get_extension_version({"com.example/x": {"version": ["2"]}}, "com.example/x") is None


# ─── AC-38.34/35 — change compatibility & successor identifier ─────────────────


class TestChangeCompatibility:
  def test_backward_compatible_changes(self):
    assert is_incompatible_change("add-optional-field") is False
    assert is_incompatible_change("add-capability-flag") is False

  def test_incompatible_changes(self):
    for kind in ("remove-field", "rename-field", "change-type", "add-required-field"):
      assert is_incompatible_change(kind) is True
    assert is_incompatible_change("change-semantics") is True

  def test_unknown_change_kind_raises(self):
    with pytest.raises(ValueError):
      is_incompatible_change("nonsense")

  def test_suggest_successor(self):
    assert suggest_successor_identifier("com.example/my-extension") == "com.example/my-extension-2"

  def test_suggest_successor_raises_for_malformed(self):
    with pytest.raises(ValueError):
      suggest_successor_identifier("no-slash")


# ─── AC-38.36/37/38 — fall back to core when inactive ──────────────────────────


class TestFallbackWhenInactive:
  def test_non_mandatory_inactive_falls_back(self):
    assert (
      decide_extension_use(identifier="com.example/x", active_set=[], mandatory=False) == "fallback"
    )

  def test_emit_no_non_active_surface(self):
    assert may_emit_extension_surface("com.example/x", []) is False

  def test_ui_inactive_uses_core_path(self):
    assert (
      decide_extension_use(
        identifier="io.modelcontextprotocol/ui", active_set=[], mandatory=False
      )
      == "fallback"
    )


# ─── AC-38.39/40 — actionable required-extension error ─────────────────────────


class TestRequiredExtensionError:
  def test_builds_error_identifying_extension(self):
    err = build_required_extension_error("com.example/needed")
    assert err.code == REQUIRED_EXTENSION_ABSENT_CODE
    assert err.code == MISSING_CLIENT_CAPABILITY_CODE
    assert err.data["requiredExtension"] == "com.example/needed"
    assert "com.example/needed" in err.message  # not opaque


# ─── AC-38.41 — mandate may refuse outright ────────────────────────────────────


class TestMandatedRefusal:
  def test_mandatory_inactive_rejects(self):
    assert (
      decide_extension_use(identifier="com.example/x", active_set=[], mandatory=True) == "reject"
    )


# ─── AC-38.42 — unrecognized identifier ignored, not an error ──────────────────


class TestUnknownIdentifierIgnored:
  def test_one_sided_unknown_excluded_without_error(self):
    active = compute_active_set({"com.unknown/thing": {}}, {"com.example/known": {}})
    assert "com.unknown/thing" not in active
    assert active == []


# ─── AC-38.43 — documented fallback behavior ───────────────────────────────────


class TestDocumentedFallback:
  def test_distinguishes_use_fallback_reject(self):
    assert decide_extension_use(identifier="e", active_set=["e"], mandatory=False) == "use-extension"
    assert decide_extension_use(identifier="e", active_set=[], mandatory=False) == "fallback"
    assert decide_extension_use(identifier="e", active_set=[], mandatory=True) == "reject"


# ─── Router accessors ──────────────────────────────────────────────────────────


class TestRouterAccessors:
  def test_has_and_owner_of(self):
    router = ExtensionMethodRouter()
    router.register("com.example/x", "x/do", lambda params: 1)
    assert router.has("x/do") is True
    assert router.has("x/none") is False
    assert router.owner_of("x/do") == "com.example/x"
    assert router.owner_of("x/none") is None

  def test_register_returns_self_for_chaining(self):
    router = ExtensionMethodRouter()
    same = router.register("com.example/x", "x/a", lambda params: 1).register(
      "com.example/x", "x/b", lambda params: 2
    )
    assert same is router
    assert router.has("x/a") and router.has("x/b")
