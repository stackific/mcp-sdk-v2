"""Tests for Elicitation I — capability, modes, request, gating, builders (§20.1–§20.3).

Mirrors ts-sdk/src/__tests__/protocol/elicitation.test.ts (S30 AC-30.1 – AC-30.17),
adapted to the Python predicate-based port (``is_valid_*`` where TS uses Zod
``*Schema.safeParse``). Plus edge cases.
"""

import pytest

from mcp.protocol.elicitation import (
  ELICITATION_CREATE_METHOD,
  ELICITATION_MODE_FORM,
  ELICITATION_MODE_URL,
  build_form_elicit_request,
  build_url_elicit_request,
  client_supports_elicitation,
  client_supports_elicitation_mode,
  gate_elicitation_request,
  is_elicitation_create_request,
  is_elicitation_mode,
  is_valid_elicit_request,
  is_valid_elicit_request_params,
  is_valid_elicitation_capability_value,
  is_valid_elicitation_url,
  is_valid_form_params,
  is_valid_requested_schema,
  is_valid_url_params,
  may_server_send_elicitation,
  resolve_elicitation_mode,
  supported_elicitation_modes,
  validate_requested_schema,
)

SCHEMA = {"type": "object", "properties": {"name": {"type": "string"}}, "required": ["name"]}

# A reusable, well-formed flat form schema (mirrors the TS `flatSchema`).
FLAT_SCHEMA = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {"name": {"type": "string"}, "age": {"type": "integer"}},
  "required": ["name"],
}


# ── method discriminator & modes ──────────────────────────────────────────────
class TestMethodAndModes:
  def test_exact_method_literal(self):
    assert ELICITATION_CREATE_METHOD == "elicitation/create"

  def test_two_modes(self):
    assert ELICITATION_MODE_FORM == "form"
    assert ELICITATION_MODE_URL == "url"
    assert is_elicitation_mode("form")
    assert is_elicitation_mode("url")
    assert not is_elicitation_mode("other")
    assert not is_elicitation_mode(None)


class TestModes:
  def test_resolve_mode(self):
    assert resolve_elicitation_mode({}) == "form"  # absent ⇒ form
    assert resolve_elicitation_mode({"mode": "form"}) == "form"
    assert resolve_elicitation_mode({"mode": "url"}) == "url"
    assert resolve_elicitation_mode({"mode": "bogus"}) is None

  def test_resolve_mode_non_object(self):
    assert resolve_elicitation_mode("nope") is None
    assert resolve_elicitation_mode(None) is None


# ── AC-30.1 (R-20.1-a) — declaration required to support elicitation ──────────
class TestDeclaration:
  def test_declaring_client_supports(self):
    assert client_supports_elicitation({"elicitation": {}})
    assert client_supports_elicitation({"elicitation": {"form": {}}})

  def test_undeclared_unsupported(self):
    assert not client_supports_elicitation({})
    assert not client_supports_elicitation({"sampling": {}})
    # A non-object value is not a declaration.
    assert not client_supports_elicitation({"elicitation": True})


# ── AC-30.2 (R-20.1-f) — capability value: optional form/url sub-flags ─────────
class TestCapabilityValue:
  def test_accepts_both_subflags_empty(self):
    assert is_valid_elicitation_capability_value({"form": {}, "url": {}})

  def test_accepts_empty_value(self):
    assert is_valid_elicitation_capability_value({})

  def test_accepts_subflag_with_settings(self):
    assert is_valid_elicitation_capability_value({"form": {"maxFields": 10}})

  def test_rejects_non_object_subflag(self):
    assert not is_valid_elicitation_capability_value({"form": True})
    assert not is_valid_elicitation_capability_value({"url": "x"})

  def test_rejects_non_object_value(self):
    assert not is_valid_elicitation_capability_value(True)
    assert not is_valid_elicitation_capability_value(None)


# ── AC-30.3 (R-20.1-b) — declaring implies at least one mode ───────────────────
class TestImpliesMode:
  def test_empty_declaration_yields_form(self):
    assert supported_elicitation_modes({"elicitation": {}}) == ["form"]
    assert len(supported_elicitation_modes({"elicitation": {}})) >= 1

  def test_explicit_form_url(self):
    assert supported_elicitation_modes({"elicitation": {"form": {}, "url": {}}}) == ["form", "url"]

  def test_undeclared_no_modes(self):
    assert supported_elicitation_modes({}) == []


# ── AC-30.4 (R-20.1-c) — `elicitation: {}` ≡ `{ form: {} }` ────────────────────
class TestEmptyEqualsFormOnly:
  def test_equivalence(self):
    empty = {"elicitation": {}}
    explicit = {"elicitation": {"form": {}}}
    assert supported_elicitation_modes(empty) == supported_elicitation_modes(explicit)
    assert client_supports_elicitation_mode(empty, "form")
    assert not client_supports_elicitation_mode(empty, "url")
    assert not client_supports_elicitation_mode(explicit, "url")


# ── AC-30.5 / AC-30.6 (R-20.1-d,e) — server-side gating ───────────────────────
class TestGating:
  def test_ok(self):
    assert gate_elicitation_request({"elicitation": {}}, "form").ok
    assert may_server_send_elicitation({"elicitation": {"url": {}}}, "url")

  def test_permits_url_when_declared(self):
    caps = {"elicitation": {"url": {}}}
    assert may_server_send_elicitation(caps, "url")
    assert gate_elicitation_request(caps, "url").ok

  def test_permits_form_by_default(self):
    assert may_server_send_elicitation({"elicitation": {}})
    assert may_server_send_elicitation({"elicitation": {}}, "form")

  def test_capability_not_declared(self):
    for mode in ("form", "url"):
      res = gate_elicitation_request({}, mode)
      assert not res.ok
      assert res.rejection == {"reason": "capability-not-declared"}
    assert not may_server_send_elicitation({})

  def test_mode_not_supported(self):
    caps = {"elicitation": {}}
    assert not may_server_send_elicitation(caps, "url")
    res = gate_elicitation_request(caps, "url")
    assert not res.ok
    assert res.rejection == {"reason": "mode-not-supported", "mode": "url"}


# ── AC-30.7 / AC-30.8 / AC-30.9 (R-20.2) — ElicitRequest shape ────────────────
class TestRequest:
  def test_form_request(self):
    req = build_form_elicit_request(message="Name?", requested_schema=SCHEMA)
    assert is_valid_elicit_request(req)
    assert is_elicitation_create_request(req)
    assert "mode" not in req["params"]  # omitted by default

  def test_strict_request_validates_embedded(self):
    req = build_form_elicit_request(message="m", requested_schema=FLAT_SCHEMA)
    assert is_valid_elicit_request(req)

  def test_exact_method_accepted(self):
    assert is_elicitation_create_request({"method": "elicitation/create", "params": {}})
    assert is_valid_elicit_request(
      {"method": "elicitation/create", "params": {"message": "m", "requestedSchema": FLAT_SCHEMA}}
    )

  def test_method_case_sensitive_rejected(self):
    assert not is_elicitation_create_request({"method": "Elicitation/Create", "params": {}})
    assert not is_elicitation_create_request({"method": "elicitation/Create"})
    assert not is_valid_elicit_request(
      {"method": "elicitation/createX", "params": {"message": "m", "requestedSchema": FLAT_SCHEMA}}
    )

  def test_params_required(self):
    # No params ⇒ not a valid ElicitRequest.
    assert not is_valid_elicit_request({"method": "elicitation/create"})

  def test_params_present_url_mode(self):
    assert is_valid_elicit_request(
      {
        "method": "elicitation/create",
        "params": {"mode": "url", "message": "m", "elicitationId": "id", "url": "https://e.com/a"},
      }
    )

  def test_invalid_request(self):
    assert not is_valid_elicit_request({"method": "other", "params": {}})
    assert not is_valid_elicit_request({"method": ELICITATION_CREATE_METHOD, "params": {"message": 1}})


# ── AC-30.10 (R-20.3-a,b,c) — form mode optional `mode` ───────────────────────
class TestFormMode:
  def test_explicit_form_mode(self):
    assert is_valid_form_params({"mode": "form", "message": "m", "requestedSchema": FLAT_SCHEMA})

  def test_absent_mode_is_form(self):
    params = {"message": "m", "requestedSchema": FLAT_SCHEMA}
    assert is_valid_form_params(params)
    assert resolve_elicitation_mode(params) == "form"

  def test_form_params_with_non_form_mode_rejected(self):
    assert not is_valid_form_params({"mode": "url", "message": "m", "requestedSchema": FLAT_SCHEMA})

  def test_resolve_mode_table(self):
    assert resolve_elicitation_mode({}) == "form"
    assert resolve_elicitation_mode({"mode": "form"}) == "form"
    assert resolve_elicitation_mode({"mode": "url"}) == "url"
    assert resolve_elicitation_mode({"mode": "bogus"}) is None

  def test_union_routes_absent_mode_to_form(self):
    params = {"message": "m", "requestedSchema": FLAT_SCHEMA}
    assert is_valid_elicit_request_params(params)


# ── AC-30.11 (R-20.3-d) — message required string ─────────────────────────────
class TestMessage:
  def test_rejects_missing_message(self):
    assert not is_valid_form_params({"requestedSchema": FLAT_SCHEMA})

  def test_rejects_non_string_message(self):
    assert not is_valid_form_params({"message": 42, "requestedSchema": FLAT_SCHEMA})


# ── AC-30.12 / AC-30.13 / AC-30.14 (R-20.3-e,f,g,h) — requestedSchema ─────────
class TestRequestedSchema:
  def test_valid(self):
    assert is_valid_requested_schema(SCHEMA)
    assert validate_requested_schema(SCHEMA).valid

  def test_rejects_non_object_root(self):
    assert not is_valid_requested_schema({"type": "string"})
    assert not validate_requested_schema({"type": "array", "properties": {}}).valid

  def test_accepts_type_object_empty_properties(self):
    assert is_valid_requested_schema({"type": "object", "properties": {}})

  def test_requires_properties(self):
    assert not is_valid_requested_schema({"type": "object"})

  def test_accepts_flat_primitives(self):
    v = validate_requested_schema(
      {"type": "object", "properties": {"a": {"type": "string"}, "b": {"type": "number"}, "c": {"type": "boolean"}}}
    )
    assert v.valid

  def test_flatness_rejects_nested(self):
    nested = {"type": "object", "properties": {"addr": {"type": "object"}}}
    v = validate_requested_schema(nested)
    assert not v.valid and any("primitive" in e["detail"] for e in v.errors)

  def test_flatness_rejects_nested_object_with_properties(self):
    v = validate_requested_schema(
      {"type": "object", "properties": {"addr": {"type": "object", "properties": {"city": {"type": "string"}}}}}
    )
    assert not v.valid
    assert any(e["path"].startswith("properties.addr") for e in v.errors)

  def test_flatness_rejects_nesting_keyword(self):
    v = validate_requested_schema({"type": "object", "properties": {"x": {"properties": {}}}})
    assert not v.valid

  def test_rejects_array_and_ref_property(self):
    assert not validate_requested_schema(
      {"type": "object", "properties": {"tags": {"type": "array", "items": {"type": "string"}}}}
    ).valid
    assert not validate_requested_schema(
      {"type": "object", "properties": {"ref": {"$ref": "#/$defs/x"}}}
    ).valid

  def test_accepts_neither_required_nor_schema(self):
    assert validate_requested_schema({"type": "object", "properties": {"x": {"type": "string"}}}).valid

  def test_accepts_required_and_schema_keyword(self):
    assert validate_requested_schema(FLAT_SCHEMA).valid

  def test_required_must_be_declared(self):
    v = validate_requested_schema({"type": "object", "properties": {"a": {"type": "string"}}, "required": ["b"]})
    assert not v.valid
    v2 = validate_requested_schema(
      {"type": "object", "properties": {"name": {"type": "string"}}, "required": ["name", "ghost"]}
    )
    assert not v2.valid

  def test_rejects_non_string_array_required_and_non_string_schema(self):
    assert not is_valid_requested_schema({"type": "object", "properties": {}, "required": [1]})
    assert not is_valid_requested_schema({"type": "object", "properties": {}, "$schema": 5})


# ── AC-30.15 / AC-30.16 (R-20.3-i,j,k,l) — url mode ────────────────────────────
class TestUrlMode:
  def test_rejects_missing_or_wrong_mode(self):
    assert not is_valid_url_params({"message": "m", "elicitationId": "id", "url": "https://e.com/a"})
    assert not is_valid_url_params({"mode": "form", "message": "m", "elicitationId": "id", "url": "https://e.com/a"})

  def test_requires_string_message(self):
    assert not is_valid_url_params({"mode": "url", "elicitationId": "id", "url": "https://e.com/a"})

  def test_accepts_well_formed(self):
    assert is_valid_url_params(
      {"mode": "url", "message": "Authorize payment", "elicitationId": "elic-1", "url": "https://pay.example.com/authorize?s=1"}
    )

  def test_requires_non_empty_elicitation_id(self):
    assert not is_valid_url_params({"mode": "url", "message": "m", "url": "https://e.com/a"})
    assert not is_valid_url_params({"mode": "url", "message": "m", "elicitationId": "", "url": "https://e.com/a"})

  def test_elicitation_id_preserved_verbatim(self):
    # opaque — never parsed or modified.
    weird = "elic-9f3c1a7e/~weird.id"
    req = build_url_elicit_request(message="m", elicitation_id=weird, url="https://e.com/a")
    assert req["params"]["elicitationId"] == weird


# ── AC-30.17 (R-20.3-m,n) — url validity ──────────────────────────────────────
class TestUrl:
  def test_valid(self):
    assert is_valid_elicitation_url("https://pay.example.com/authorize?session=9f3c1a7e")
    assert is_valid_elicitation_url("http://e.com")
    assert is_valid_elicitation_url("https://example.com/auth")
    assert is_valid_elicitation_url("mailto:a@b.com")

  def test_invalid(self):
    assert not is_valid_elicitation_url(None)
    assert not is_valid_elicitation_url("")
    assert not is_valid_elicitation_url("/relative")
    assert not is_valid_elicitation_url("/relative/path")
    assert not is_valid_elicitation_url("not a url")
    assert not is_valid_elicitation_url("not-a-url")


# ── Builders & end-to-end shapes ──────────────────────────────────────────────
class TestBuilders:
  def test_form_omits_mode_by_default(self):
    req = build_form_elicit_request(message="Provide details", requested_schema=FLAT_SCHEMA)
    assert req["method"] == "elicitation/create"
    assert "mode" not in req["params"]
    assert is_valid_elicit_request(req)

  def test_form_can_include_mode(self):
    req = build_form_elicit_request(message="m", requested_schema=FLAT_SCHEMA, include_mode=True)
    assert req["params"]["mode"] == "form"

  def test_form_request_invalid_schema_raises(self):
    with pytest.raises(TypeError):
      build_form_elicit_request(
        message="x", requested_schema={"type": "object", "properties": {"a": {"type": "array"}}}
      )

  def test_form_request_nested_schema_raises(self):
    with pytest.raises(TypeError):
      build_form_elicit_request(
        message="m", requested_schema={"type": "object", "properties": {"a": {"type": "object"}}}
      )

  def test_url_request(self):
    req = build_url_elicit_request(message="Authorize", elicitation_id="e1", url="https://example.com/auth")
    assert is_valid_elicit_request(req) and req["params"]["mode"] == "url"

  def test_url_request_resolves_url_mode(self):
    req = build_url_elicit_request(
      message="Please complete payment authorization in your browser",
      elicitation_id="elic-9f3c1a7e",
      url="https://pay.example.com/authorize?session=9f3c1a7e",
    )
    assert is_valid_elicit_request(req)
    assert resolve_elicitation_mode(req["params"]) == "url"

  def test_url_request_bad_url_raises(self):
    with pytest.raises(TypeError):
      build_url_elicit_request(message="x", elicitation_id="e1", url="relative")
    with pytest.raises(TypeError):
      build_url_elicit_request(message="m", elicitation_id="id", url="nope")

  def test_url_request_empty_id_raises(self):
    with pytest.raises(TypeError):
      build_url_elicit_request(message="x", elicitation_id="", url="https://x/y")


# ── Supplementary capability checks ───────────────────────────────────────────
class TestCapability:
  def test_supports(self):
    assert client_supports_elicitation({"elicitation": {}})
    assert not client_supports_elicitation({})

  def test_supported_modes(self):
    assert supported_elicitation_modes({"elicitation": {}}) == ["form"]
    assert supported_elicitation_modes({"elicitation": {"url": {}}}) == ["form", "url"]
    assert supported_elicitation_modes({}) == []

  def test_supports_mode(self):
    assert client_supports_elicitation_mode({"elicitation": {}}, "form")
    assert not client_supports_elicitation_mode({"elicitation": {}}, "url")


# ── AC-30.7 (R-20.2-a) — delivered inside an input_required result ────────────
# Mirrors the TS cross-module test that an `ElicitRequest` is a valid member of an
# `InputRequiredResult` and is recognized by the §11 / S17 input-request anchor.
class TestInputRequiredDelivery:
  def test_elicit_request_is_valid_input_required_member(self):
    from mcp.jsonrpc.payload import RESULT_TYPE_INPUT_REQUIRED
    from mcp.protocol.multi_round_trip import (
      is_valid_input_request,
      is_valid_input_required_result,
    )

    elicit = build_form_elicit_request(message="Provide details", requested_schema=FLAT_SCHEMA)
    result = {
      "resultType": RESULT_TYPE_INPUT_REQUIRED,
      "inputRequests": {"user-profile": elicit},
      "requestState": "opaque-token",
    }
    # The S17-owned envelope accepts the embedded elicitation/create request.
    assert is_valid_input_required_result(result)
    # And it is recognized by the S17 elicitation input-request anchor.
    assert is_valid_input_request(elicit)
    # Our stricter ElicitRequest predicate also validates the embedded request.
    assert is_valid_elicit_request(elicit)

  def test_url_elicit_request_is_valid_input_required_member(self):
    from mcp.jsonrpc.payload import RESULT_TYPE_INPUT_REQUIRED
    from mcp.protocol.multi_round_trip import (
      is_valid_input_request,
      is_valid_input_required_result,
    )

    elicit = build_url_elicit_request(
      message="Authorize", elicitation_id="elic-1", url="https://pay.example.com/authorize?s=1"
    )
    result = {"resultType": RESULT_TYPE_INPUT_REQUIRED, "inputRequests": {"authz": elicit}}
    assert is_valid_input_required_result(result)
    assert is_valid_input_request(elicit)
    assert is_valid_elicit_request(elicit)


# ── Edge cases beyond the TS AC mirrors ───────────────────────────────────────
class TestEdgeCases:
  def test_capability_value_non_object_value(self):
    # A non-dict capability value is not valid.
    assert not is_valid_elicitation_capability_value(True)
    assert not is_valid_elicitation_capability_value(None)
    assert not is_valid_elicitation_capability_value([])

  def test_params_present_form_mode_explicit(self):
    # An explicit form mode passes the union and validates the embedded request.
    req = {
      "method": ELICITATION_CREATE_METHOD,
      "params": {"mode": "form", "message": "m", "requestedSchema": FLAT_SCHEMA},
    }
    assert is_valid_elicit_request(req)
    assert resolve_elicitation_mode(req["params"]) == "form"

  def test_request_params_non_object_rejected(self):
    assert not is_valid_elicit_request_params(None)
    assert not is_valid_elicit_request_params("nope")
    assert not is_valid_elicit_request_params([])

  def test_url_params_rejects_invalid_url(self):
    assert not is_valid_url_params(
      {"mode": "url", "message": "m", "elicitationId": "id", "url": "not a url"}
    )

  def test_form_params_rejects_bad_schema(self):
    # Parity with TS AC-30.13: flatness is NOT judged by the structural form-params
    # predicate but by validate_requested_schema. A structurally well-formed but
    # non-flat schema is therefore ACCEPTED by is_valid_form_params...
    nested = {"type": "object", "properties": {"a": {"type": "object"}}}
    assert is_valid_form_params({"message": "m", "requestedSchema": nested})
    # ...and rejected only by the dedicated flatness validator (R-20.3-f).
    assert not validate_requested_schema(nested).valid

  def test_gate_default_mode_is_form(self):
    # gate/may_server default to form mode (matching the absent-mode baseline).
    assert gate_elicitation_request({"elicitation": {}}).ok
    assert may_server_send_elicitation({"elicitation": {}})

  def test_resolve_mode_preserves_string_constants(self):
    assert resolve_elicitation_mode({"mode": ELICITATION_MODE_URL}) == ELICITATION_MODE_URL
    assert resolve_elicitation_mode({"mode": ELICITATION_MODE_FORM}) == ELICITATION_MODE_FORM

  def test_build_url_request_preserves_query(self):
    # The url is carried verbatim, including its query string.
    url = "https://pay.example.com/authorize?session=9f3c1a7e&amount=42"
    req = build_url_elicit_request(message="m", elicitation_id="e1", url=url)
    assert req["params"]["url"] == url
