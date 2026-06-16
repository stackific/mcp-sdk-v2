"""Tests for Elicitation II — form schema, results, consent, security (§20.4–§20.8).

Mirrors ts-sdk/src/__tests__/protocol/elicitation-form.test.ts (S31 AC-31.1 –
AC-31.32), adapted to the Python predicate-based port (``is_valid_*`` /
``classify_*`` where TS uses Zod ``*Schema.safeParse``). Plus edge cases.
"""

import pytest

from mcp.protocol.elicitation import ELICITATION_MODE_FORM, ELICITATION_MODE_URL
from mcp.protocol.elicitation_form import (
  ELICITATION_COMPLETE_NOTIFICATION_METHOD,
  NUMBER_SCHEMA_TYPES,
  STRING_SCHEMA_FORMATS,
  assert_form_mode_may_collect,
  build_accept_result,
  build_cancel_result,
  build_decline_result,
  build_elicitation_complete_notification,
  build_url_accept_result,
  build_url_consent_presentation,
  check_elicitation_url_safety,
  classify_enum_schema,
  classify_primitive_schema,
  extract_defaults,
  find_sensitive_form_fields,
  handle_elicitation_complete,
  is_elicit_action,
  is_elicitation_complete_notification,
  is_legacy_titled_enum_schema,
  is_primitive_schema_definition,
  is_restricted_form_schema,
  is_string_schema_format,
  is_valid_boolean_schema,
  is_valid_elicit_content_value,
  is_valid_enum_schema,
  is_valid_number_schema,
  is_valid_string_schema,
  is_valid_strict_elicit_result,
  is_valid_titled_enum_option,
  may_render_url_clickable,
  resolve_elicit_action_outcome,
  validate_elicit_content,
  validate_elicit_result,
  validate_restricted_form_schema,
  verify_elicitation_user_binding,
)

STR = {"type": "string", "minLength": 2}
NUM = {"type": "integer", "minimum": 0, "maximum": 120}
BOOL = {"type": "boolean"}
ENUM = {"type": "string", "enum": ["a", "b"]}
TITLED = {"type": "string", "oneOf": [{"const": "a", "title": "A"}, {"const": "b", "title": "B"}]}
MULTI = {"type": "array", "items": {"type": "string", "enum": ["x", "y"]}, "minItems": 1}
LEGACY = {"type": "string", "enum": ["a"], "enumNames": ["A"]}
SCHEMA = {"type": "object", "properties": {"name": STR, "age": NUM}, "required": ["name"]}

# A representative form-mode requestedSchema reused across tests (mirrors `sampleSchema`).
SAMPLE_SCHEMA = {
  "type": "object",
  "properties": {
    "name": {"type": "string", "description": "Your full name", "maxLength": 120},
    "email": {"type": "string", "format": "email", "description": "Your email address"},
    "age": {"type": "integer", "minimum": 18, "default": 18},
    "newsletter": {"type": "boolean", "default": False},
    "plan": {
      "type": "string",
      "title": "Plan",
      "oneOf": [{"const": "free", "title": "Free"}, {"const": "pro", "title": "Pro"}],
      "default": "free",
    },
  },
  "required": ["name", "email"],
}


# ── AC-31.1 (R-20.4-a) — restricted flat object of primitive props ────────────
class TestRestrictedSchema:
  def test_valid(self):
    assert validate_restricted_form_schema(SCHEMA).valid
    assert is_restricted_form_schema(SCHEMA)
    assert validate_restricted_form_schema(SAMPLE_SCHEMA).valid
    assert is_restricted_form_schema(SAMPLE_SCHEMA)

  def test_rejects_nested_property(self):
    nested = {"type": "object", "properties": {"address": {"type": "object", "properties": {"city": {"type": "string"}}}}}
    assert not validate_restricted_form_schema(nested).valid
    assert not is_restricted_form_schema(nested)
    v = validate_restricted_form_schema({"type": "object", "properties": {"addr": {"type": "object"}}})
    assert not v.valid

  def test_rejects_array_of_objects(self):
    arr = {"type": "object", "properties": {"items": {"type": "array", "items": {"type": "object", "properties": {}}}}}
    assert not validate_restricted_form_schema(arr).valid

  def test_rejects_composition_keyword(self):
    composed = {"type": "object", "properties": {"x": {"$ref": "#/$defs/Thing"}}}
    assert not validate_restricted_form_schema(composed).valid

  def test_rejects_undeclared_required(self):
    v = validate_restricted_form_schema({"type": "object", "properties": {"a": STR}, "required": ["b"]})
    assert not v.valid


# ── AC-31.2 (R-20.4-b) — schema usable, validation non-erroring either way ────
class TestSchemaUsable:
  def test_use_or_skip_validation(self):
    content = {"name": "Octocat", "email": "octocat@github.com", "age": 30}
    assert validate_elicit_content(content, SAMPLE_SCHEMA).valid
    assert validate_restricted_form_schema(SAMPLE_SCHEMA).valid


# ── AC-31.3 (R-20.4-c) — per-field default extraction ─────────────────────────
class TestDefaults:
  def test_extract_defaults(self):
    schema = {"type": "object", "properties": {"a": {"type": "string", "default": "x"}, "b": {"type": "boolean"}}}
    assert extract_defaults(schema) == {"a": "x"}

  def test_extract_defaults_across_kinds(self):
    assert extract_defaults(SAMPLE_SCHEMA) == {"age": 18, "newsletter": False, "plan": "free"}

  def test_every_primitive_permits_default(self):
    assert is_valid_string_schema({"type": "string", "default": "x"})
    assert is_valid_number_schema({"type": "number", "default": 1})
    assert is_valid_boolean_schema({"type": "boolean", "default": True})


# ── AC-31.4 (R-20.4-d) — StringSchema.format restricted to four literals ──────
class TestStringFormat:
  def test_accepts_four_formats(self):
    for f in STRING_SCHEMA_FORMATS:
      assert is_valid_string_schema({"type": "string", "format": f})
      assert is_string_schema_format(f)
    assert STRING_SCHEMA_FORMATS == ("email", "uri", "date", "date-time")

  def test_rejects_other_format(self):
    assert not is_valid_string_schema({"type": "string", "format": "phone"})
    assert not is_string_schema_format("phone")


# ── AC-31.5 (R-20.4-e) — NumberSchema.type restricted to number|integer ───────
class TestNumberType:
  def test_accepts_number_and_integer(self):
    assert NUMBER_SCHEMA_TYPES == ("number", "integer")
    assert is_valid_number_schema({"type": "number"})
    assert is_valid_number_schema({"type": "integer"})
    assert classify_primitive_schema({"type": "integer", "minimum": 0}) == "number"

  def test_rejects_other_type(self):
    assert not is_valid_number_schema({"type": "bigint"})
    assert not is_valid_number_schema({"type": "string"})


# ── AC-31.6 (R-20.4-f) — legacy enum not adopted, accepted from peer ──────────
class TestLegacyEnum:
  LEGACY = {"type": "string", "enum": ["r", "g", "b"], "enumNames": ["Red", "Green", "Blue"]}

  def test_legacy_parses_from_peer(self):
    assert is_valid_enum_schema(self.LEGACY)
    assert is_legacy_titled_enum_schema(self.LEGACY)
    assert classify_enum_schema(self.LEGACY) == "legacy-titled"

  def test_modern_not_classified_legacy(self):
    modern = {"type": "string", "oneOf": [{"const": "r", "title": "Red"}, {"const": "g", "title": "Green"}]}
    assert not is_legacy_titled_enum_schema(modern)
    assert classify_enum_schema(modern) == "titled-single-select"


# ── AC-31.7 (R-20.4-g) — per-option labels ⇒ titled single-select ─────────────
class TestTitledSingleSelect:
  def test_titled_form_carries_oneof(self):
    titled = {"type": "string", "oneOf": [{"const": "free", "title": "Free"}, {"const": "pro", "title": "Pro"}]}
    assert is_valid_enum_schema(titled)
    # both const and title required per option
    assert not is_valid_titled_enum_option({"const": "free"})
    missing_title = {"type": "string", "oneOf": [{"const": "free"}]}
    assert not is_valid_enum_schema(missing_title)

  def test_all_five_forms_classify_distinctly(self):
    assert classify_enum_schema({"type": "string", "enum": ["a"]}) == "untitled-single-select"
    assert classify_enum_schema({"type": "string", "oneOf": [{"const": "a", "title": "A"}]}) == "titled-single-select"
    assert classify_enum_schema({"type": "array", "items": {"type": "string", "enum": ["a"]}}) == "untitled-multi-select"
    assert classify_enum_schema({"type": "array", "items": {"anyOf": [{"const": "a", "title": "A"}]}}) == "titled-multi-select"
    assert classify_enum_schema(LEGACY) == "legacy-titled"
    assert is_valid_enum_schema({"type": "string", "enum": ["a"]})
    assert is_valid_enum_schema({"type": "array", "items": {"type": "string", "enum": ["a"]}})
    assert is_valid_enum_schema({"type": "array", "items": {"anyOf": [{"const": "a", "title": "A"}]}})


# ── PrimitiveSchemaDefinition union classification ────────────────────────────
class TestPrimitiveSchemas:
  def test_classify(self):
    assert classify_primitive_schema(STR) == "string"
    assert classify_primitive_schema(NUM) == "number"
    assert classify_primitive_schema(BOOL) == "boolean"
    assert classify_primitive_schema(ENUM) == "enum"
    assert classify_primitive_schema(TITLED) == "enum"
    assert classify_primitive_schema(MULTI) == "enum"
    assert classify_primitive_schema({"type": "object"}) is None

  def test_classify_structural(self):
    assert classify_primitive_schema({"type": "string"}) == "string"
    assert classify_primitive_schema({"type": "string", "format": "email"}) == "string"
    assert classify_primitive_schema({"type": "number"}) == "number"
    assert classify_primitive_schema({"type": "boolean"}) == "boolean"
    assert classify_primitive_schema({"type": "string", "enum": ["a", "b"]}) == "enum"

  def test_enum_forms(self):
    assert classify_enum_schema(ENUM) == "untitled-single-select"
    assert classify_enum_schema(TITLED) == "titled-single-select"
    assert classify_enum_schema(MULTI) == "untitled-multi-select"
    assert classify_enum_schema({"type": "array", "items": {"anyOf": [{"const": "a", "title": "A"}]}}) == "titled-multi-select"
    assert classify_enum_schema(LEGACY) == "legacy-titled"
    assert is_legacy_titled_enum_schema(LEGACY)

  def test_is_primitive(self):
    assert is_primitive_schema_definition(STR)
    assert is_primitive_schema_definition(ENUM)
    assert is_primitive_schema_definition({"type": "boolean"})
    assert is_primitive_schema_definition({"type": "number", "maximum": 10})
    assert not is_primitive_schema_definition({"type": "object"})


# ── AC-31.8 (R-20.5-a) — action required, one of accept|decline|cancel ────────
class TestAction:
  def test_accepts_three_actions(self):
    for a in ("accept", "decline", "cancel"):
      assert is_elicit_action(a)
      assert is_valid_strict_elicit_result({"action": a})

  def test_rejects_missing_or_unknown(self):
    assert not is_valid_strict_elicit_result({})
    assert not is_valid_strict_elicit_result({"action": "maybe"})
    assert not is_elicit_action("maybe")
    assert not validate_elicit_result({"action": "maybe"}, ELICITATION_MODE_FORM).valid


# ── AC-31.9 (R-20.5-b) — content presence rules by mode and action ────────────
class TestContentPresence:
  def test_permits_content_on_form_accept(self):
    res = {"action": "accept", "content": {"name": "A", "email": "a@b.co"}}
    assert validate_elicit_result(res, ELICITATION_MODE_FORM, SAMPLE_SCHEMA).valid

  def test_url_accept_with_content_malformed(self):
    assert not validate_elicit_result({"action": "accept", "content": {"x": "y"}}, ELICITATION_MODE_URL).valid

  def test_rejects_content_on_decline_or_cancel(self):
    assert not validate_elicit_result({"action": "decline", "content": {"x": "y"}}, ELICITATION_MODE_FORM).valid
    assert not validate_elicit_result({"action": "cancel", "content": {"x": "y"}}, ELICITATION_MODE_FORM).valid

  def test_url_accept_without_content_valid(self):
    assert validate_elicit_result({"action": "accept"}, ELICITATION_MODE_URL).valid


# ── AC-31.10 (R-20.5-c) — content value typing and schema conformance ─────────
class TestContentConformance:
  def test_value_typing(self):
    for v in ("s", 1, True, ["a", "b"]):
      assert is_valid_elicit_content_value(v)

  def test_rejects_other_value_types(self):
    assert not is_valid_elicit_content_value({})
    assert not is_valid_elicit_content_value(None)
    assert not is_valid_elicit_content_value([1, 2])

  def test_valid(self):
    assert validate_elicit_content({"name": "Ada", "age": 30}, SCHEMA).valid
    assert validate_elicit_content(
      {"name": "Octocat", "email": "o@x.co", "age": 30, "newsletter": True, "plan": "pro"}, SAMPLE_SCHEMA
    ).valid

  def test_conformance_failures(self):
    # integer field given a non-integer
    assert not validate_elicit_content({"name": "A", "email": "a@b.co", "age": 30.5}, SAMPLE_SCHEMA).valid
    # below minimum
    assert not validate_elicit_content({"name": "A", "email": "a@b.co", "age": 5}, SAMPLE_SCHEMA).valid
    # enum value not permitted
    assert not validate_elicit_content({"name": "A", "email": "a@b.co", "plan": "enterprise"}, SAMPLE_SCHEMA).valid
    # missing required field
    assert not validate_elicit_content({"name": "A"}, SAMPLE_SCHEMA).valid
    # unknown field
    assert not validate_elicit_content({"name": "A", "email": "a@b.co", "nope": "x"}, SAMPLE_SCHEMA).valid
    # wrong type for a boolean field
    assert not validate_elicit_content({"name": "A", "email": "a@b.co", "newsletter": "yes"}, SAMPLE_SCHEMA).valid

  def test_missing_required(self):
    assert not validate_elicit_content({"age": 30}, SCHEMA).valid

  def test_unknown_field(self):
    assert not validate_elicit_content({"name": "Ada", "extra": 1}, SCHEMA).valid

  def test_type_mismatch(self):
    assert not validate_elicit_content({"name": "Ada", "age": "old"}, SCHEMA).valid

  def test_string_length(self):
    assert not validate_elicit_content({"name": "A"}, SCHEMA).valid  # minLength 2

  def test_number_bounds(self):
    assert not validate_elicit_content({"name": "Ada", "age": 200}, SCHEMA).valid

  def test_enum_membership(self):
    schema = {"type": "object", "properties": {"c": ENUM}}
    assert validate_elicit_content({"c": "a"}, schema).valid
    assert not validate_elicit_content({"c": "z"}, schema).valid

  def test_multi_select(self):
    multi_schema = {
      "type": "object",
      "properties": {"tags": {"type": "array", "minItems": 1, "maxItems": 2, "items": {"type": "string", "enum": ["a", "b", "c"]}}},
    }
    assert validate_elicit_content({"tags": ["a", "b"]}, multi_schema).valid
    assert not validate_elicit_content({"tags": []}, multi_schema).valid  # < minItems
    assert not validate_elicit_content({"tags": ["a", "b", "c"]}, multi_schema).valid  # > maxItems
    assert not validate_elicit_content({"tags": ["z"]}, multi_schema).valid  # not a member

  def test_multi_select_via_shared(self):
    schema = {"type": "object", "properties": {"m": MULTI}}
    assert validate_elicit_content({"m": ["x"]}, schema).valid
    assert not validate_elicit_content({"m": []}, schema).valid  # minItems 1
    assert not validate_elicit_content({"m": ["z"]}, schema).valid  # not a permitted value


# ── AC-31.11 (R-20.5-d) — accept handling: form processes, url is consent ─────
class TestAcceptHandling:
  def test_form_accept_processes_data(self):
    outcome = resolve_elicit_action_outcome(
      {"action": "accept", "content": {"name": "A", "email": "a@b.co"}}, ELICITATION_MODE_FORM, SAMPLE_SCHEMA
    )
    assert outcome.handle == "process-form-data"
    assert outcome.content == {"name": "A", "email": "a@b.co"}

  def test_url_accept_awaits_completion(self):
    outcome = resolve_elicit_action_outcome({"action": "accept"}, ELICITATION_MODE_URL)
    assert outcome.handle == "await-url-completion"


# ── AC-31.12 / AC-31.13 (R-20.5-e,f) — decline and cancel handling ────────────
class TestDeclineCancel:
  def test_decline_path(self):
    assert resolve_elicit_action_outcome({"action": "decline"}, ELICITATION_MODE_FORM).handle == "declined"
    assert build_decline_result() == {"action": "decline"}

  def test_cancel_path(self):
    assert resolve_elicit_action_outcome({"action": "cancel"}, ELICITATION_MODE_URL).handle == "cancelled"
    assert build_cancel_result() == {"action": "cancel"}


# ── AC-31.14 (R-20.5-g,h) — no assume-success; defined branch for failure ─────
class TestNoAssumeSuccess:
  def test_malformed_not_success(self):
    outcome = resolve_elicit_action_outcome(
      {"action": "accept", "content": {"name": "A", "email": "a@b.co", "age": "old"}}, ELICITATION_MODE_FORM, SAMPLE_SCHEMA
    )
    assert outcome.handle == "malformed"
    assert len(outcome.errors) > 0

  def test_every_action_distinct_branch(self):
    branches = {
      resolve_elicit_action_outcome({"action": "accept", "content": {"name": "A", "email": "a@b.co"}}, ELICITATION_MODE_FORM, SAMPLE_SCHEMA).handle,
      resolve_elicit_action_outcome({"action": "accept"}, ELICITATION_MODE_URL).handle,
      resolve_elicit_action_outcome({"action": "decline"}, ELICITATION_MODE_FORM).handle,
      resolve_elicit_action_outcome({"action": "cancel"}, ELICITATION_MODE_FORM).handle,
      resolve_elicit_action_outcome({"action": "bogus"}, ELICITATION_MODE_FORM).handle,
    }
    assert branches == {"process-form-data", "await-url-completion", "declined", "cancelled", "malformed"}


# ── AC-31.15 (R-20.5-i,j) — client validates before send; server on receipt ───
class TestValidateBeforeAndAfter:
  def test_build_accept_validates_client_side(self):
    result = build_accept_result({"name": "A", "email": "a@b.co", "age": 20}, SAMPLE_SCHEMA)
    assert result["action"] == "accept"
    with pytest.raises(TypeError):
      build_accept_result({"name": "A"}, SAMPLE_SCHEMA)

  def test_server_side_validation(self):
    assert validate_elicit_content({"name": "A", "email": "a@b.co"}, SAMPLE_SCHEMA).valid
    assert not validate_elicit_content({"email": "a@b.co"}, SAMPLE_SCHEMA).valid


# ── Result actions / builders (shared) ────────────────────────────────────────
class TestResultActions:
  def test_validate_form_accept(self):
    res = {"action": "accept", "content": {"name": "Ada"}}
    assert validate_elicit_result(res, "form", SCHEMA).valid

  def test_content_only_on_accept(self):
    assert not validate_elicit_result({"action": "decline", "content": {"name": "x"}}, "form").valid

  def test_no_content_on_url_accept(self):
    assert not validate_elicit_result({"action": "accept", "content": {"name": "x"}}, "url").valid

  def test_builders(self):
    assert build_accept_result({"name": "Ada"}, SCHEMA) == {"action": "accept", "content": {"name": "Ada"}}
    assert build_url_accept_result() == {"action": "accept"}
    assert build_decline_result() == {"action": "decline"}
    assert build_cancel_result() == {"action": "cancel"}

  def test_build_accept_invalid_raises(self):
    with pytest.raises(TypeError):
      build_accept_result({"name": "A"}, SCHEMA)  # too short

  def test_outcome(self):
    assert resolve_elicit_action_outcome({"action": "accept", "content": {"name": "Ada"}}, "form", SCHEMA).handle == "process-form-data"
    assert resolve_elicit_action_outcome({"action": "accept"}, "url").handle == "await-url-completion"
    assert resolve_elicit_action_outcome({"action": "decline"}, "form").handle == "declined"
    assert resolve_elicit_action_outcome({"action": "cancel"}, "form").handle == "cancelled"
    assert resolve_elicit_action_outcome({"action": "bogus"}, "form").handle == "malformed"

  def test_edit_before_send(self):
    edited = build_accept_result({"name": "Edited", "email": "e@x.co"}, SAMPLE_SCHEMA)
    assert edited["content"] == {"name": "Edited", "email": "e@x.co"}


# ── AC-31.16 / AC-31.17 (R-20.6-a,b,c) — complete notification ────────────────
class TestCompleteNotification:
  def test_build_and_validate(self):
    assert ELICITATION_COMPLETE_NOTIFICATION_METHOD == "notifications/elicitation/complete"
    note = build_elicitation_complete_notification("id-123")
    assert note["method"] == ELICITATION_COMPLETE_NOTIFICATION_METHOD
    assert note["jsonrpc"] == "2.0"
    assert note["params"]["elicitationId"] == "id-123"
    assert is_elicitation_complete_notification(note)
    assert "id" not in note  # it is a notification, no id

  def test_carries_id_verbatim(self):
    original = "550e8400-e29b-41d4-a716-446655440000"
    note = build_elicitation_complete_notification(original)
    assert note["params"]["elicitationId"] == original

  def test_empty_id_raises(self):
    with pytest.raises(TypeError):
      build_elicitation_complete_notification("")

  def test_rejects_empty_params(self):
    assert not is_elicitation_complete_notification(
      {"jsonrpc": "2.0", "method": ELICITATION_COMPLETE_NOTIFICATION_METHOD, "params": {}}
    )

  def test_handle(self):
    note = build_elicitation_complete_notification("e1")
    assert handle_elicitation_complete(note, {"e1": "pending"}).action == "complete"
    assert handle_elicitation_complete(note, {"e1": "completed"}).reason == "already-completed"
    assert handle_elicitation_complete(note, {}).reason == "unknown-id"

  def test_foreign_id_unknown(self):
    note = build_elicitation_complete_notification("foreign-id")
    handling = handle_elicitation_complete(note, {"my-id": "pending"})
    assert handling.action == "ignore" and handling.reason == "unknown-id"


# ── AC-31.18 / AC-31.19 (R-20.6-d,e,f) — ignore / auto-continue ───────────────
class TestCompleteHandling:
  def test_ignores_unknown_id(self):
    note = build_elicitation_complete_notification("x")
    h = handle_elicitation_complete(note, {})
    assert h.action == "ignore" and h.reason == "unknown-id"

  def test_ignores_already_completed(self):
    note = build_elicitation_complete_notification("x")
    h = handle_elicitation_complete(note, {"x": "completed"})
    assert h.action == "ignore" and h.reason == "already-completed"

  def test_ignores_malformed(self):
    assert handle_elicitation_complete({"method": "other"}, {"x": "pending"}).action == "ignore"

  def test_pending_completes(self):
    note = build_elicitation_complete_notification("x")
    h = handle_elicitation_complete(note, {"x": "pending"})
    assert h.action == "complete" and h.elicitation_id == "x"

  def test_manual_recovery_independent(self):
    assert build_cancel_result()["action"] == "cancel"
    assert build_decline_result()["action"] == "decline"


# ── AC-31.20 / AC-31.21 / AC-31.22 (R-20.7-a..g) — user control affordances ───
class TestUserControl:
  def test_action_vocabulary(self):
    assert build_url_accept_result() == {"action": "accept"}
    assert build_decline_result() == {"action": "decline"}
    assert build_cancel_result() == {"action": "cancel"}

  def test_consent_presentation_surfaces_request(self):
    p = build_url_consent_presentation("https://mcp.example.com/ui/connect")
    assert p.host == "mcp.example.com"
    assert "mcp.example.com" in p.full_url


# ── AC-31.23 (R-20.7-h,i) — sensitive ⇒ url mode; contact data permitted ──────
class TestSecurity:
  def test_sensitive_fields(self):
    schema = {"type": "object", "properties": {"password": {"type": "string"}, "name": {"type": "string"}}}
    assert find_sensitive_form_fields(schema) == ["password"]

  def test_flags_multiple_sensitive(self):
    sensitive = {
      "type": "object",
      "properties": {
        "password": {"type": "string"},
        "api_key": {"type": "string", "title": "API Key"},
        "token": {"type": "string"},
      },
    }
    flagged = find_sensitive_form_fields(sensitive)
    assert set(flagged) >= {"password", "api_key", "token"}
    check = assert_form_mode_may_collect(sensitive)
    assert not check.ok and len(check.sensitive_fields) > 0

  def test_does_not_flag_contact(self):
    contact = {
      "type": "object",
      "properties": {
        "name": {"type": "string"},
        "email": {"type": "string", "format": "email"},
        "username": {"type": "string"},
      },
    }
    assert find_sensitive_form_fields(contact) == []
    assert assert_form_mode_may_collect(contact).ok


# ── AC-31.24 / AC-31.25 / AC-31.26 (R-20.7-j..o) — identity binding ───────────
class TestUserBinding:
  def test_user_binding(self):
    assert verify_elicitation_user_binding("sub-1", "sub-1").ok
    assert verify_elicitation_user_binding("sub-1", "sub-2").reason == "subject-mismatch"
    assert verify_elicitation_user_binding(None, "sub-1").reason == "unverified-identity"

  def test_match(self):
    r = verify_elicitation_user_binding("user-1", "user-1")
    assert r.ok

  def test_mismatch(self):
    r = verify_elicitation_user_binding("victim", "attacker")
    assert not r.ok and r.reason == "subject-mismatch"
    assert r.expected == "victim" and r.actual == "attacker"

  def test_missing_subject(self):
    assert not verify_elicitation_user_binding(None, "x").ok
    assert not verify_elicitation_user_binding("x", None).ok
    r = verify_elicitation_user_binding(None, None)
    assert not r.ok and r.reason == "unverified-identity"


# ── AC-31.27 / AC-31.28 (R-20.7-p,q,r,s) — safe URL construction ──────────────
class TestUrlSafety:
  def test_url_safety(self):
    assert check_elicitation_url_safety("https://example.com/auth").safe
    assert not check_elicitation_url_safety("http://example.com/auth").safe  # insecure
    assert check_elicitation_url_safety("http://example.com/auth", allow_insecure=True).safe
    bad = check_elicitation_url_safety("https://u:p@example.com/auth?token=abc")
    assert not bad.safe
    reasons = {r["reason"] for r in bad.reasons}
    assert "pre-authenticated" in reasons and "contains-sensitive-info" in reasons

  def test_clean_https(self):
    res = check_elicitation_url_safety("https://mcp.example.com/ui/set_api_key")
    assert res.safe and res.reasons == []

  def test_flags_sensitive_param_and_credentials(self):
    r1 = check_elicitation_url_safety("https://x.example.com/cb?access_token=abc")
    assert not r1.safe
    r2 = check_elicitation_url_safety("https://user:pass@x.example.com/")
    assert not r2.safe
    assert any(x["reason"] == "pre-authenticated" for x in r2.reasons)

  def test_insecure_scheme_and_allow_insecure(self):
    assert not check_elicitation_url_safety("http://localhost:3000/ui").safe
    res = check_elicitation_url_safety("http://localhost:3000/ui", allow_insecure=True)
    assert res.safe and res.reasons == []

  def test_url_safety_invalid(self):
    assert not check_elicitation_url_safety("relative").safe

  def test_clickable(self):
    assert may_render_url_clickable("url", "url")
    assert not may_render_url_clickable("url", "form")
    assert not may_render_url_clickable("other", "url")
    assert not may_render_url_clickable("description", ELICITATION_MODE_FORM)
    assert not may_render_url_clickable("message", ELICITATION_MODE_URL)


# ── AC-31.29 / AC-31.30 / AC-31.31 (R-20.7-t..y) — safe URL handling (client) ─
class TestConsentPresentation:
  def test_consent_presentation(self):
    p = build_url_consent_presentation("https://auth.example.com/login")
    assert p.host == "auth.example.com" and p.domain == "example.com" and p.scheme == "https"
    assert p.warnings == []

  def test_consent_shows_full_url_and_domain(self):
    p = build_url_consent_presentation("https://login.mcp.example.com/oauth?x=1")
    assert p.full_url == "https://login.mcp.example.com/oauth?x=1"
    assert p.host == "login.mcp.example.com"
    assert p.domain == "example.com"
    assert p.scheme == "https"

  def test_consent_punycode_warning(self):
    p = build_url_consent_presentation("https://xn--80ak6aa92e.com/login")
    assert p.contains_punycode and p.warnings
    p2 = build_url_consent_presentation("https://xn--80ak6aa92e.com/path")
    assert p2.contains_punycode
    assert any("punycode" in w.lower() for w in p2.warnings)

  def test_warns_non_https_and_credentials(self):
    p = build_url_consent_presentation("http://user:pass@evil.example.com/")
    assert len(p.warnings) >= 2

  def test_rejects_invalid_url(self):
    with pytest.raises(TypeError):
      build_url_consent_presentation("not a url")


# ── AC-31.32 (R-20.7-z,aa) — not an authorization mechanism ───────────────────
class TestNotAuthz:
  def test_url_accept_content_free(self):
    assert build_url_accept_result() == {"action": "accept"}
    assert not validate_elicit_result({"action": "accept", "content": {"token": "x"}}, ELICITATION_MODE_URL).valid

  def test_pre_authenticated_url_unsafe(self):
    assert not check_elicitation_url_safety("https://user:token@api.example.com/resource").safe


# ── AC-31.15 (R-20.5-i,j) — cross-module: results parse under the S17 anchor ───
# Mirrors the TS test that a built ElicitResult is also accepted by the
# multi-round-trip-owned `ElicitResultSchema` (Python: `is_valid_elicit_result`).
class TestResultCrossModule:
  def test_built_results_parse_under_s17_anchor(self):
    from mcp.protocol.multi_round_trip import is_valid_elicit_result

    accepted = build_accept_result({"name": "A", "email": "a@b.co", "age": 20}, SAMPLE_SCHEMA)
    assert accepted["action"] == "accept"
    # The S17 ElicitResult anchor still accepts the built result.
    assert is_valid_elicit_result(accepted)
    assert is_valid_elicit_result(build_url_accept_result())
    assert is_valid_elicit_result(build_decline_result())
    assert is_valid_elicit_result(build_cancel_result())

  def test_bad_content_throws_rather_than_sent(self):
    # The client-side pre-send check rejects malformed content (never sent).
    with pytest.raises(TypeError):
      build_accept_result({"name": "A"}, SAMPLE_SCHEMA)


# ── Edge cases beyond the TS AC mirrors ───────────────────────────────────────
class TestEdgeCases:
  def test_classify_array_without_items_is_none(self):
    assert classify_primitive_schema({"type": "array"}) is None
    assert classify_enum_schema({"type": "array", "items": {"foo": 1}}) is None

  def test_titled_single_select_requires_const_and_title(self):
    # Structurally a titled-single-select, but invalid because an option lacks a title.
    bad = {"type": "string", "oneOf": [{"const": "a"}]}
    assert classify_enum_schema(bad) == "titled-single-select"
    assert not is_valid_enum_schema(bad)

  def test_content_value_bool_and_float(self):
    assert is_valid_elicit_content_value(True)
    assert is_valid_elicit_content_value(1.5)
    assert not is_valid_elicit_content_value(None)
    assert not is_valid_elicit_content_value([1, 2])
    assert not is_valid_elicit_content_value({})

  def test_strict_result_rejects_disallowed_content_value(self):
    assert not is_valid_strict_elicit_result({"action": "accept", "content": {"x": None}})
    assert not is_valid_strict_elicit_result({"action": "accept", "content": {"x": {}}})

  def test_number_schema_rejects_bool_default(self):
    # A boolean is not a number — even though Python treats bool as an int subtype.
    assert not is_valid_number_schema({"type": "number", "default": True})
    assert is_valid_number_schema({"type": "number", "default": 1})

  def test_integer_field_rejects_non_integer_content(self):
    schema = {"type": "object", "properties": {"n": {"type": "integer"}}}
    assert validate_elicit_content({"n": 3}, schema).valid
    assert not validate_elicit_content({"n": 3.5}, schema).valid
    # A plain "number" field accepts a float.
    num_schema = {"type": "object", "properties": {"n": {"type": "number"}}}
    assert validate_elicit_content({"n": 3.5}, num_schema).valid

  def test_validate_result_without_schema_skips_content_conformance(self):
    # When no requestedSchema is supplied, a form-mode accept with content is accepted
    # as far as action/content-presence rules go (no schema conformance to check).
    res = {"action": "accept", "content": {"anything": "goes"}}
    assert validate_elicit_result(res, ELICITATION_MODE_FORM).valid

  def test_extract_defaults_non_object(self):
    assert extract_defaults("nope") == {}
    assert extract_defaults({"type": "object"}) == {}  # no properties
    assert extract_defaults({"type": "object", "properties": "bad"}) == {}

  def test_find_sensitive_non_object(self):
    assert find_sensitive_form_fields("nope") == []
    assert find_sensitive_form_fields({"type": "object"}) == []

  def test_handle_complete_completed_then_pending_distinct(self):
    note = build_elicitation_complete_notification("e1")
    assert handle_elicitation_complete(note, {"e1": "pending"}).action == "complete"
    assert handle_elicitation_complete(note, {"e1": "completed"}).action == "ignore"

  def test_url_safety_combines_multiple_reasons(self):
    bad = check_elicitation_url_safety("http://u:p@example.com/cb?token=abc")
    assert not bad.safe
    reasons = {r["reason"] for r in bad.reasons}
    # Embedded creds + sensitive param + non-https all surface together.
    assert reasons == {"pre-authenticated", "contains-sensitive-info", "insecure-scheme"}

  def test_consent_presentation_single_label_host(self):
    # A single-label host (e.g. localhost) yields domain == host.
    p = build_url_consent_presentation("http://localhost:3000/ui")
    assert p.host == "localhost"
    assert p.domain == "localhost"
    assert any("non-HTTPS" in w for w in p.warnings)
