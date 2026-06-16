"""Tests for capability negotiation + gating (§6.1–§6.4).

Mirrors ``ts-sdk/src/__tests__/protocol/capability-negotiation.test.ts`` AC for AC
(AC-10.1 … AC-10.26) — with the TS ``ClientCapabilitiesSchema`` / ``ServerCapabilitiesSchema``
``safeParse`` cases expressed through the structural validators
``is_valid_client_capabilities`` / ``is_valid_server_capabilities`` — plus extra edge cases.
"""

from mcp.protocol.capability_negotiation import (
  CAPABILITY_ERROR_HTTP_STATUS,
  INVALID_PARAMS_CODE,
  MISSING_CLIENT_CAPABILITY_CODE,
  client_declares,
  client_should_expect_notification,
  compute_missing_client_capabilities,
  decide_degradation,
  gate_required_client_capabilities,
  http_status_for_capability_error,
  is_deprecated_client_capability,
  is_deprecated_server_capability,
  is_valid_client_capabilities,
  is_valid_server_capabilities,
  may_client_invoke,
  may_invoke_roots_list,
  may_invoke_sampling,
  may_use_include_context,
  may_use_sampling_tools,
  may_use_url_elicitation,
  notification_required_capability,
  server_declares,
  server_method_required_capability,
  validate_request_meta,
)
from mcp.protocol.meta import (
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  PROTOCOL_VERSION_META_KEY,
)


# ─── schema validity (the Zod safeParse cases) ────────────────────────────────

class TestCapabilitySchemas:
  def test_empty_object_valid_for_both(self):
    assert is_valid_client_capabilities({})
    assert is_valid_server_capabilities({})

  def test_non_object_invalid_for_both(self):
    for bad in (None, [], "elicitation", 1, True):
      assert not is_valid_client_capabilities(bad)
      assert not is_valid_server_capabilities(bad)

  def test_parses_the_client_capabilities_example(self):
    # §9.1 ClientCapabilities wire example.
    assert is_valid_client_capabilities({
      "elicitation": {"form": {}, "url": {}},
      "sampling": {"context": {}},
      "experimental": {"com.example/preview": {"beta": True}},
    })

  def test_parses_the_server_capabilities_example(self):
    # §9.2 ServerCapabilities wire example.
    assert is_valid_server_capabilities({
      "tools": {"listChanged": True},
      "resources": {"subscribe": True, "listChanged": False},
      "prompts": {},
      "completions": {},
      "logging": {},
    })

  def test_unknown_top_level_keys_pass_through(self):
    # .passthrough() — receivers ignore unknown members (§2.6).
    assert is_valid_client_capabilities({"made.up/cap": {}})
    assert is_valid_server_capabilities({"made.up/cap": {}})

  def test_client_experimental_must_be_record_of_objects(self):
    assert is_valid_client_capabilities({"experimental": {}})
    assert is_valid_client_capabilities({"experimental": {"x.y/z": {"a": 1}}})
    assert not is_valid_client_capabilities({"experimental": {"x.y/z": 1}})
    assert not is_valid_client_capabilities({"experimental": []})
    assert not is_valid_client_capabilities({"experimental": "nope"})

  def test_client_extensions_must_be_record_of_objects(self):
    assert is_valid_client_capabilities({"extensions": {}})
    assert not is_valid_client_capabilities({"extensions": {"ext": True}})

  def test_client_elicitation_subflags_must_be_objects(self):
    assert is_valid_client_capabilities({"elicitation": {}})
    assert is_valid_client_capabilities({"elicitation": {"form": {}, "url": {}}})
    assert not is_valid_client_capabilities({"elicitation": {"url": True}})
    assert not is_valid_client_capabilities({"elicitation": "form"})

  def test_client_sampling_subflags_must_be_objects(self):
    assert is_valid_client_capabilities({"sampling": {}})
    assert is_valid_client_capabilities({"sampling": {"context": {}, "tools": {}}})
    assert not is_valid_client_capabilities({"sampling": {"tools": 1}})

  def test_client_roots_must_be_object(self):
    assert is_valid_client_capabilities({"roots": {}})
    assert not is_valid_client_capabilities({"roots": True})

  def test_client_passthrough_allows_extra_subflag_keys(self):
    # .passthrough() on the sub-flag object tolerates unknown nested keys.
    assert is_valid_client_capabilities({"elicitation": {"form": {}, "extra": 1}})

  def test_server_completions_and_logging_must_be_objects(self):
    assert is_valid_server_capabilities({"completions": {}, "logging": {}})
    assert not is_valid_server_capabilities({"completions": True})
    assert not is_valid_server_capabilities({"logging": "yes"})

  def test_server_boolean_subflags_must_be_bool_when_present(self):
    assert is_valid_server_capabilities({"prompts": {"listChanged": True}})
    assert is_valid_server_capabilities({"tools": {"listChanged": False}})
    assert is_valid_server_capabilities({"resources": {"subscribe": True, "listChanged": True}})
    # Strict booleans: 1 / 0 / "true" are not accepted (z.boolean()).
    assert not is_valid_server_capabilities({"tools": {"listChanged": 1}})
    assert not is_valid_server_capabilities({"resources": {"subscribe": "true"}})

  def test_server_capability_objects_reject_non_objects(self):
    assert not is_valid_server_capabilities({"prompts": True})
    assert not is_valid_server_capabilities({"resources": []})
    assert not is_valid_server_capabilities({"tools": "tools"})

  def test_server_extensions_must_be_record_of_objects(self):
    assert is_valid_server_capabilities({"extensions": {}})
    assert not is_valid_server_capabilities({"extensions": {"ext": 1}})

  def test_section_9_1_example_declares_each_expected_subflag(self):
    # The §9.1 wire example, read through the gating predicates end-to-end.
    caps = {
      "elicitation": {"form": {}, "url": {}},
      "sampling": {"context": {}},
      "experimental": {"com.example/preview": {"beta": True}},
    }
    assert is_valid_client_capabilities(caps)
    assert client_declares(caps, "elicitation")
    assert client_declares(caps, "elicitation.form")
    assert client_declares(caps, "elicitation.url")
    assert client_declares(caps, "sampling")
    assert client_declares(caps, "sampling.context")
    assert not client_declares(caps, "sampling.tools")
    assert client_declares(caps, "experimental")

  def test_section_9_2_example_declares_each_expected_subflag(self):
    # The §9.2 wire example, read through the gating predicates end-to-end.
    caps = {
      "tools": {"listChanged": True},
      "resources": {"subscribe": True, "listChanged": False},
      "prompts": {},
      "completions": {},
      "logging": {},
    }
    assert is_valid_server_capabilities(caps)
    assert server_declares(caps, "tools")
    assert server_declares(caps, "tools.listChanged")
    assert server_declares(caps, "resources")
    assert server_declares(caps, "resources.subscribe")
    # listChanged is explicitly False ⇒ NOT declared (strict True).
    assert not server_declares(caps, "resources.listChanged")
    assert server_declares(caps, "prompts")
    assert not server_declares(caps, "prompts.listChanged")
    assert server_declares(caps, "completions")
    assert server_declares(caps, "logging")


# ─── AC-10.1 — caps derived per-request only ──────────────────────────────────

class TestPerRequestDerivation:
  def test_client_declares_reads_only_the_supplied_object(self):
    assert client_declares({"elicitation": {}}, "elicitation")
    # A different request declaring {} sees nothing — no prior-state bleed.
    assert not client_declares({}, "elicitation")


# ─── AC-10.2 — no reliance on undeclared capability ───────────────────────────

class TestNoRelianceOnUndeclared:
  def test_may_client_invoke_false_for_undeclared_gated_method(self):
    assert not may_client_invoke("tools/call", {})
    assert may_client_invoke("tools/call", {"tools": {}})


# ─── AC-10.3 — sub-flags refine within the family ─────────────────────────────

class TestSubflagsRefineFamily:
  def test_tools_list_changed_refines_tools(self):
    caps = {"tools": {"listChanged": True}}
    assert server_declares(caps, "tools")
    assert server_declares(caps, "tools.listChanged")

  def test_base_capability_stands_without_subflag(self):
    caps = {"tools": {}}
    assert server_declares(caps, "tools")
    assert not server_declares(caps, "tools.listChanged")


# ─── AC-10.4 — no inference between capabilities ──────────────────────────────

class TestNoInferenceBetweenCapabilities:
  def test_declaring_sampling_does_not_imply_elicitation(self):
    caps = {"sampling": {}}
    assert client_declares(caps, "sampling")
    assert not client_declares(caps, "elicitation")


# ─── AC-10.5 — prepared for non-sub-flag family ops ───────────────────────────

class TestPreparedForFamilyOps:
  def test_server_declaring_tools_is_invocable_for_both_tools_methods(self):
    caps = {"tools": {}}
    assert may_client_invoke("tools/list", caps)
    assert may_client_invoke("tools/call", caps)


# ─── AC-10.6 — omission declares non-support ──────────────────────────────────

class TestOmissionDeclaresNonSupport:
  def test_omitted_field_is_not_declared(self):
    assert not client_declares({}, "roots")
    assert not server_declares({}, "logging")


# ─── AC-10.7 — experimental map; ignore unknown keys ──────────────────────────

class TestExperimentalMap:
  def test_accepts_experimental_and_ignores_unknown_keys(self):
    assert is_valid_client_capabilities({"experimental": {"x.y/z": {"a": 1}}})
    # Unknown top-level keys survive; gating predicates simply ignore them.
    assert client_declares({"experimental": {}, "made.up/cap": {}}, "experimental")


# ─── AC-10.8 — elicitation + form implicit baseline ───────────────────────────

class TestElicitationFormBaseline:
  def test_elicitation_present_implies_form(self):
    assert client_declares({"elicitation": {}}, "elicitation")
    assert client_declares({"elicitation": {}}, "elicitation.form")

  def test_explicit_form_is_supported(self):
    assert client_declares({"elicitation": {"form": {}}}, "elicitation.form")

  def test_no_elicitation_no_form(self):
    assert not client_declares({}, "elicitation.form")


# ─── AC-10.9 — url mode only when url present ──────────────────────────────────

class TestUrlElicitationGating:
  def test_not_allowed_when_url_absent(self):
    assert not may_use_url_elicitation({"elicitation": {}})
    assert not may_use_url_elicitation({"elicitation": {"form": {}}})

  def test_allowed_only_when_url_subflag_present(self):
    assert may_use_url_elicitation({"elicitation": {"url": {}}})


# ─── AC-10.10 — deprecated roots ──────────────────────────────────────────────

class TestDeprecatedRoots:
  def test_gates_roots_list_and_is_deprecated(self):
    assert may_invoke_roots_list({"roots": {}})
    assert not may_invoke_roots_list({})
    assert is_deprecated_client_capability("roots")


# ─── AC-10.11 — deprecated sampling ───────────────────────────────────────────

class TestDeprecatedSampling:
  def test_gates_sampling_create_message_and_is_deprecated(self):
    assert may_invoke_sampling({"sampling": {}})
    assert not may_invoke_sampling({})
    assert is_deprecated_client_capability("sampling")


# ─── AC-10.12 — sampling.context gates includeContext ─────────────────────────

class TestSamplingContextGating:
  def test_without_context_only_none_or_omit_allowed(self):
    caps = {"sampling": {}}
    assert may_use_include_context(caps, None)
    assert may_use_include_context(caps, "none")
    assert not may_use_include_context(caps, "thisServer")
    assert not may_use_include_context(caps, "allServers")

  def test_with_context_any_value_allowed(self):
    caps = {"sampling": {"context": {}}}
    assert may_use_include_context(caps, "allServers")
    assert may_use_include_context(caps, "thisServer")

  def test_none_value_allowed_even_without_sampling_at_all(self):
    # `None`/"none" never need the sub-flag, even when sampling itself is absent.
    assert may_use_include_context({}, None)
    assert may_use_include_context({}, "none")

  def test_unknown_value_still_requires_context_subflag(self):
    # Any non-None, non-"none" value is gated on sampling.context.
    assert not may_use_include_context({"sampling": {}}, "everything")
    assert may_use_include_context({"sampling": {"context": {}}}, "everything")


# ─── AC-10.13 — sampling.tools gates tools/toolChoice ─────────────────────────

class TestSamplingToolsGating:
  def test_not_allowed_without_subflag(self):
    assert not may_use_sampling_tools({"sampling": {}})

  def test_allowed_only_with_subflag(self):
    assert may_use_sampling_tools({"sampling": {"tools": {}}})


# ─── AC-10.14 — client extensions; empty valid ────────────────────────────────

class TestClientExtensions:
  def test_optional_and_empty_object_declares_nothing(self):
    assert is_valid_client_capabilities({})
    assert client_declares({"extensions": {}}, "extensions")
    assert not client_declares({}, "extensions")


# ─── AC-10.15 — completions gates completion/complete ─────────────────────────

class TestCompletionsGating:
  def test_completion_complete_requires_completions(self):
    assert server_method_required_capability("completion/complete") == "completions"
    assert not may_client_invoke("completion/complete", {})
    assert may_client_invoke("completion/complete", {"completions": {}})


# ─── AC-10.16 — prompts + listChanged ─────────────────────────────────────────

class TestPromptsCapability:
  def test_gates_prompts_methods(self):
    assert may_client_invoke("prompts/get", {"prompts": {}})
    assert not may_client_invoke("prompts/list", {})

  def test_list_changed_notification_gating(self):
    assert client_should_expect_notification(
      "notifications/prompts/list_changed", {"prompts": {"listChanged": True}}
    )
    assert not client_should_expect_notification(
      "notifications/prompts/list_changed", {"prompts": {}}
    )
    assert not client_should_expect_notification(
      "notifications/prompts/list_changed", {"prompts": {"listChanged": False}}
    )


# ─── AC-10.17 — resources + subscribe/listChanged ─────────────────────────────

class TestResourcesCapability:
  def test_gates_resource_methods(self):
    assert may_client_invoke("resources/read", {"resources": {}})
    assert not may_client_invoke("resources/list", {})

  def test_subscribe_gates_updated_notification(self):
    assert client_should_expect_notification(
      "notifications/resources/updated", {"resources": {"subscribe": True}}
    )
    assert not client_should_expect_notification(
      "notifications/resources/updated", {"resources": {}}
    )

  def test_list_changed_gates_list_changed_notification(self):
    assert client_should_expect_notification(
      "notifications/resources/list_changed", {"resources": {"listChanged": True}}
    )
    # subscribe true alone does NOT enable list_changed.
    assert not client_should_expect_notification(
      "notifications/resources/list_changed", {"resources": {"subscribe": True}}
    )


# ─── AC-10.18 — tools + listChanged ───────────────────────────────────────────

class TestToolsCapability:
  def test_gates_tools_methods_and_list_changed(self):
    assert may_client_invoke("tools/call", {"tools": {}})
    assert notification_required_capability("notifications/tools/list_changed") == "tools.listChanged"
    assert client_should_expect_notification(
      "notifications/tools/list_changed", {"tools": {"listChanged": True}}
    )
    assert not client_should_expect_notification(
      "notifications/tools/list_changed", {"tools": {}}
    )


# ─── AC-10.19 — deprecated logging ────────────────────────────────────────────

class TestDeprecatedLogging:
  def test_gates_message_notification_and_is_deprecated(self):
    assert client_should_expect_notification("notifications/message", {"logging": {}})
    assert not client_should_expect_notification("notifications/message", {})
    assert is_deprecated_server_capability("logging")


# ─── AC-10.20 — server extensions; empty valid ────────────────────────────────

class TestServerExtensions:
  def test_optional_and_empty_object_declares_nothing(self):
    assert is_valid_server_capabilities({"extensions": {}})
    assert server_declares({"extensions": {}}, "extensions")
    assert not server_declares({}, "extensions")


# ─── AC-10.21 / AC-10.22 — server consults per-request caps ───────────────────

class TestServerConsultsPerRequestCaps:
  def test_input_request_gated_by_originating_request_caps(self):
    # Originating request declared elicitation ⇒ server may emit the input request.
    assert gate_required_client_capabilities({"elicitation": {}}, {"elicitation": {}}).ok
    # Originating request declared {} ⇒ server must not rely on elicitation.
    assert not gate_required_client_capabilities({}, {"elicitation": {}}).ok


# ─── AC-10.23 — client consults server caps ───────────────────────────────────

class TestClientConsultsServerCaps:
  def test_does_not_invoke_method_with_undeclared_capability(self):
    server_caps = {"tools": {}}  # from the most recent server/discover result
    assert may_client_invoke("tools/call", server_caps)
    assert not may_client_invoke("resources/read", server_caps)

  def test_core_method_always_invocable(self):
    assert may_client_invoke("server/discover", {})

  def test_required_capability_lookup(self):
    assert server_method_required_capability("tools/call") == "tools"
    assert server_method_required_capability("server/discover") is None

  def test_ungated_notification_always_expected(self):
    # An unmapped (core) notification is ungated ⇒ always expected, regardless of caps.
    assert notification_required_capability("notifications/initialized") is None
    assert client_should_expect_notification("notifications/initialized", {})
    assert client_should_expect_notification("notifications/cancelled", {})

  def test_every_gated_method_in_map_is_blocked_when_caps_empty(self):
    # No capability ⇒ every gated server method is non-invocable.
    for method in (
      "completion/complete",
      "prompts/list",
      "prompts/get",
      "resources/list",
      "resources/read",
      "tools/list",
      "tools/call",
    ):
      assert not may_client_invoke(method, {})


# ─── AC-10.24 — missing cap → -32003 + HTTP 400 ───────────────────────────────

class TestMissingCapabilityGate:
  def test_compute_missing(self):
    assert compute_missing_client_capabilities(
      {"sampling": {}}, {"sampling": {}, "roots": {}}
    ) == {"roots": {}}

  def test_compute_missing_returns_only_undeclared_subset(self):
    assert compute_missing_client_capabilities(
      {"elicitation": {}}, {"elicitation": {}, "sampling": {}}
    ) == {"sampling": {}}

  def test_compute_missing_by_key_presence_only(self):
    # Presence of the KEY satisfies the requirement, regardless of declared value.
    assert compute_missing_client_capabilities(
      {"sampling": {"tools": {}}}, {"sampling": {}}
    ) == {}

  def test_compute_missing_preserves_required_values(self):
    # The missing map carries the value from `required`, not from `declared`.
    assert compute_missing_client_capabilities(
      {}, {"elicitation": {"url": {}}}
    ) == {"elicitation": {"url": {}}}

  def test_compute_missing_empty_required_is_empty(self):
    assert compute_missing_client_capabilities({"tools": {}}, {}) == {}

  def test_gate_ok(self):
    assert gate_required_client_capabilities({"roots": {}}, {"roots": {}}).ok

  def test_gate_ok_has_no_error(self):
    assert gate_required_client_capabilities({"roots": {}}, {"roots": {}}).error is None

  def test_gate_empty_required_always_ok(self):
    assert gate_required_client_capabilities({}, {}).ok

  def test_gate_missing(self):
    result = gate_required_client_capabilities({}, {"sampling": {}})
    assert not result.ok
    assert result.error["code"] == MISSING_CLIENT_CAPABILITY_CODE
    assert result.error["data"]["requiredCapabilities"] == {"sampling": {}}

  def test_gate_missing_lists_only_the_undeclared(self):
    result = gate_required_client_capabilities({"sampling": {}}, {"elicitation": {}})
    assert not result.ok
    assert result.error["code"] == -32003
    assert result.error["data"]["requiredCapabilities"] == {"elicitation": {}}

  def test_http_status(self):
    assert http_status_for_capability_error(MISSING_CLIENT_CAPABILITY_CODE) == CAPABILITY_ERROR_HTTP_STATUS
    assert http_status_for_capability_error(-32601) is None

  def test_http_status_constant_is_400(self):
    assert CAPABILITY_ERROR_HTTP_STATUS == 400
    assert http_status_for_capability_error(-32003) == 400

  def test_gate_error_full_payload_shape(self):
    # The -32003 error payload mirrors build_missing_capability_error end-to-end.
    result = gate_required_client_capabilities({}, {"elicitation": {}, "sampling": {}})
    assert not result.ok
    assert result.error == {
      "code": MISSING_CLIENT_CAPABILITY_CODE,
      "message": "Missing required client capability",
      "data": {"requiredCapabilities": {"elicitation": {}, "sampling": {}}},
    }

  def test_http_status_returns_none_for_unrelated_codes(self):
    # Only -32003 and -32602 map to 400; everything else is None.
    assert http_status_for_capability_error(-32600) is None
    assert http_status_for_capability_error(-32700) is None
    assert http_status_for_capability_error(0) is None
    assert http_status_for_capability_error(200) is None


# ─── AC-10.25 — malformed _meta → -32602 + HTTP 400 ───────────────────────────

class TestMalformedMeta:
  def test_rejects_request_omitting_required_meta_field_with_32602(self):
    result = validate_request_meta({
      PROTOCOL_VERSION_META_KEY: "2026-07-28",
      CLIENT_INFO_META_KEY: {"name": "c", "version": "1"},
      # clientCapabilities omitted
    })
    assert not result.ok
    assert result.code == INVALID_PARAMS_CODE

  def test_well_formed_meta_passes(self):
    result = validate_request_meta({
      PROTOCOL_VERSION_META_KEY: "2026-07-28",
      CLIENT_INFO_META_KEY: {"name": "c", "version": "1"},
      CLIENT_CAPABILITIES_META_KEY: {},
    })
    assert result.ok

  def test_maps_32602_to_http_400(self):
    assert http_status_for_capability_error(INVALID_PARAMS_CODE) == 400
    assert http_status_for_capability_error(-32602) == 400


# ─── AC-10.26 — graceful degradation ──────────────────────────────────────────

class TestDegradation:
  def test_proceed_when_peer_declares(self):
    assert decide_degradation(peer_declares_behavior=True, behavior_mandatory=True) == "proceed"
    assert decide_degradation(peer_declares_behavior=True, behavior_mandatory=False) == "proceed"

  def test_fallback_when_optional_and_undeclared(self):
    assert decide_degradation(peer_declares_behavior=False, behavior_mandatory=False) == "fallback"

  def test_reject_only_when_mandatory_and_undeclared(self):
    assert decide_degradation(peer_declares_behavior=False, behavior_mandatory=True) == "reject"


# ─── Deprecated capability predicates ─────────────────────────────────────────

class TestDeprecated:
  def test_client(self):
    assert is_deprecated_client_capability("roots")
    assert is_deprecated_client_capability("sampling")
    assert not is_deprecated_client_capability("elicitation")

  def test_server(self):
    assert is_deprecated_server_capability("logging")
    assert not is_deprecated_server_capability("tools")


# ─── server_declares boolean strictness edge cases ────────────────────────────

class TestServerDeclares:
  def test_object_capabilities(self):
    assert server_declares({"tools": {}}, "tools")
    assert not server_declares({}, "resources")

  def test_boolean_subflags_only_when_true(self):
    assert server_declares({"tools": {"listChanged": True}}, "tools.listChanged")
    assert not server_declares({"tools": {"listChanged": False}}, "tools.listChanged")
    assert not server_declares({"tools": {}}, "tools.listChanged")
    assert server_declares({"resources": {"subscribe": True}}, "resources.subscribe")

  def test_truthy_non_bool_is_not_declared(self):
    # Strict identity to True — a truthy non-bool does not declare the sub-flag.
    assert not server_declares({"tools": {"listChanged": 1}}, "tools.listChanged")

  def test_array_or_non_object_value_is_not_declared(self):
    # isObject excludes arrays / non-dicts (TS `!Array.isArray`).
    assert not server_declares({"tools": []}, "tools")
    assert not server_declares({"resources": "x"}, "resources")
    assert not server_declares({"tools": None}, "tools.listChanged")

  def test_unknown_server_capability_name_is_not_declared(self):
    assert not server_declares({"made.up": {}}, "made.up")


# ─── client_declares edge cases ───────────────────────────────────────────────

class TestClientDeclares:
  def test_object_capabilities(self):
    assert client_declares({"elicitation": {}}, "elicitation")
    assert client_declares({"roots": {}}, "roots")
    assert not client_declares({}, "sampling")

  def test_elicitation_form_implicit_baseline(self):
    assert client_declares({"elicitation": {}}, "elicitation.form")

  def test_elicitation_url_needs_subflag(self):
    assert client_declares({"elicitation": {"url": {}}}, "elicitation.url")
    assert not client_declares({"elicitation": {}}, "elicitation.url")

  def test_sampling_subflags(self):
    assert client_declares({"sampling": {"tools": {}}}, "sampling.tools")
    assert not client_declares({"sampling": {}}, "sampling.context")

  def test_unknown_capability_name_is_not_declared(self):
    assert not client_declares({"made.up": {}}, "made.up")

  def test_array_or_non_object_capability_value_is_not_declared(self):
    # isObject excludes arrays / non-dicts (TS `!Array.isArray`).
    assert not client_declares({"elicitation": []}, "elicitation")
    assert not client_declares({"sampling": "x"}, "sampling")
    # A non-dict nested sub-flag holder yields no sub-flag.
    assert not client_declares({"elicitation": []}, "elicitation.url")
    assert not client_declares({"sampling": None}, "sampling.tools")
