"""Tests for S06 — Stateless Per-Request Model & Cross-Call Continuity (§4.4–§4.7).

Mirrors ``ts-sdk/src/__tests__/protocol/stateless.test.ts`` and adds Python-specific
edge cases (the ``bool``-is-``int`` subclass ordering, ``float``/``tuple``/``set``/
``bytes``/``complex``/``Ellipsis``/type objects, dict identity of the rule maps).

AC coverage:
  AC-06.1  (R-4.4-a)  — request processed without prior-request state
  AC-06.2  (R-4.4-b)  — first request processed without handshake
  AC-06.3  (R-4.4-c)  — identity derived from current _meta only
  AC-06.4  (R-4.4-d)  — no per-connection conversational state needed
  AC-06.6  (R-4.4-f)  — connection/process identity not a conversation proxy
  AC-06.8  (R-4.4-h)  — multiple independent tasks on one connection
  AC-06.9  (R-4.4-i)  — related ops can span different connections
  AC-06.10 (R-4.4-j)  — connection/process lifetime != conversation boundary
  AC-06.11 (R-4.5-a)  — cross-request state via explicit identifier
  AC-06.12 (R-4.5-b)  — server mints opaque continuation identifier
  AC-06.13 (R-4.5-c)  — client echoes identifier verbatim (opaque)
  AC-06.14 (R-4.5-d)  — continuation works across connections/instances
  AC-06.15 (R-4.6-a)  — list results connection-independent
"""

from mcp.protocol.stateless import (
  DEFERRED_TO_TRANSPORT,
  STATELESS_MODEL,
  is_string_continuation_id,
  is_valid_continuation_id,
)


# ─── is_valid_continuation_id (AC-06.11–AC-06.14 · R-4.5-a – R-4.5-d) ──────────


class TestIsValidContinuationId:
  def test_accepts_a_string_continuation_id(self):
    assert is_valid_continuation_id("eyJvIjoxMDB9.Zm9vYmFy") is True

  def test_accepts_a_number_continuation_id(self):
    assert is_valid_continuation_id(42) is True

  def test_accepts_zero_as_a_continuation_id(self):
    # Falsy but JSON-serializable — must not be confused with "absent".
    assert is_valid_continuation_id(0) is True

  def test_accepts_a_float_continuation_id(self):
    # JSON numbers cover floats; the TS `typeof === 'number'` branch admits them.
    assert is_valid_continuation_id(3.14) is True
    assert is_valid_continuation_id(0.0) is True

  def test_accepts_negative_number(self):
    assert is_valid_continuation_id(-1) is True

  def test_accepts_a_boolean_continuation_id(self):
    # Unusual but JSON-serializable.
    assert is_valid_continuation_id(True) is True
    assert is_valid_continuation_id(False) is True

  def test_accepts_none_as_a_continuation_id(self):
    # Python None maps to the TS `null` branch.
    assert is_valid_continuation_id(None) is True

  def test_accepts_an_array_continuation_id(self):
    assert is_valid_continuation_id([1, 2, 3]) is True

  def test_accepts_an_empty_array(self):
    assert is_valid_continuation_id([]) is True

  def test_accepts_a_tuple_continuation_id(self):
    # Python's immutable sequence is the analogue of TS ReadonlyArray.
    assert is_valid_continuation_id((1, 2, 3)) is True
    assert is_valid_continuation_id(()) is True

  def test_accepts_an_object_continuation_id(self):
    assert is_valid_continuation_id({"offset": 100, "version": 2}) is True

  def test_accepts_an_empty_object(self):
    assert is_valid_continuation_id({}) is True

  def test_accepts_a_nested_structure(self):
    assert is_valid_continuation_id({"a": [1, {"b": None}], "c": True}) is True

  # — rejections: not JSON-serializable —

  def test_rejects_a_callable(self):
    # Mirrors TS rejecting a Function (AC-06.13 — opaque, no construction).
    assert is_valid_continuation_id(lambda: None) is False

  def test_rejects_a_builtin_function(self):
    assert is_valid_continuation_id(len) is False

  def test_rejects_a_type_object(self):
    # A class/type is the closest Python analogue to a non-serializable handle.
    assert is_valid_continuation_id(int) is False
    assert is_valid_continuation_id(object) is False

  def test_rejects_a_set(self):
    # Sets are not JSON-serializable (no JSON set type) — mirrors TS Symbol exclusion.
    assert is_valid_continuation_id({1, 2, 3}) is False

  def test_rejects_a_frozenset(self):
    assert is_valid_continuation_id(frozenset({1, 2})) is False

  def test_rejects_bytes(self):
    # bytes are not JSON values.
    assert is_valid_continuation_id(b"token") is False

  def test_rejects_a_complex_number(self):
    # complex cannot round-trip through JSON; analogue of TS bigint exclusion.
    assert is_valid_continuation_id(1 + 2j) is False

  def test_rejects_ellipsis(self):
    assert is_valid_continuation_id(...) is False

  def test_rejects_an_arbitrary_object_instance(self):
    class Opaque:
      pass

    assert is_valid_continuation_id(Opaque()) is False


# ─── is_string_continuation_id (AC-06.12 · R-4.5-b, AC-06.13 · R-4.5-c) ────────


class TestIsStringContinuationId:
  def test_returns_true_for_a_string(self):
    assert is_string_continuation_id("opaque-token-value") is True

  def test_returns_true_for_an_empty_string(self):
    # Even empty strings are valid continuation ids.
    assert is_string_continuation_id("") is True

  def test_returns_false_for_a_number(self):
    assert is_string_continuation_id(42) is False

  def test_returns_false_for_a_float(self):
    assert is_string_continuation_id(3.14) is False

  def test_returns_false_for_none(self):
    assert is_string_continuation_id(None) is False

  def test_returns_false_for_a_boolean(self):
    # bool is not str even though both are truthy/serializable.
    assert is_string_continuation_id(True) is False
    assert is_string_continuation_id(False) is False

  def test_returns_false_for_a_list(self):
    assert is_string_continuation_id(["a"]) is False

  def test_returns_false_for_an_object(self):
    assert is_string_continuation_id({"k": "v"}) is False

  def test_returns_false_for_bytes(self):
    # bytes is a separate type from str; must not be treated as a string id.
    assert is_string_continuation_id(b"opaque") is False


# ─── bool / int subclass ordering (Python-specific edge) ──────────────────────


class TestBoolIntOrdering:
  """In Python ``bool`` is a subclass of ``int``; both are valid continuation ids,
  but the predicates must classify them by Python type, not numeric coercion.
  """

  def test_bool_is_valid_continuation_id(self):
    assert is_valid_continuation_id(True) is True
    assert is_valid_continuation_id(False) is True

  def test_int_is_valid_continuation_id(self):
    assert is_valid_continuation_id(1) is True
    assert is_valid_continuation_id(0) is True

  def test_bool_is_not_a_string_continuation_id(self):
    assert is_string_continuation_id(True) is False
    assert is_string_continuation_id(False) is False


# ─── Opaqueness: clients must not parse/modify (AC-06.13 · R-4.5-c) ────────────


class TestContinuationIdentifierOpaqueness:
  def test_any_verbatim_echo_of_a_server_minted_string_is_valid(self):
    minted = "eyJzdGVwIjoiYXdhaXQiLCJzaWciOiJhYmMifQ=="
    # The client must echo verbatim — is_valid_continuation_id accepts it unchanged.
    assert is_valid_continuation_id(minted) is True

  def test_a_base64_looking_string_is_valid_regardless_of_structure(self):
    assert is_valid_continuation_id("aGVsbG8gd29ybGQ=") is True

  def test_a_uuid_looking_string_is_valid(self):
    # Client must not try to parse as a UUID.
    assert is_valid_continuation_id("550e8400-e29b-41d4-a716-446655440000") is True

  def test_a_jwt_looking_string_is_valid(self):
    assert is_valid_continuation_id("aaa.bbb.ccc") is True

  def test_a_string_with_arbitrary_bytes_is_valid(self):
    # Opaqueness means the value's internal structure is irrelevant.
    assert is_valid_continuation_id("\x00\x01￿ not-parsed") is True


# ─── STATELESS_MODEL constants (AC-06.1 – AC-06.15) ───────────────────────────


class TestStatelessModelConstants:
  def test_documents_the_no_prior_request_inference_rule(self):
    assert STATELESS_MODEL["NO_PRIOR_REQUEST_INFERENCE"] == "R-4.4-a"

  def test_documents_the_no_handshake_required_rule(self):
    assert STATELESS_MODEL["NO_HANDSHAKE_REQUIRED"] == "R-4.4-b"

  def test_documents_the_identity_from_meta_only_rule(self):
    assert STATELESS_MODEL["IDENTITY_FROM_META_ONLY"] == "R-4.4-c"

  def test_documents_the_no_per_connection_state_rule(self):
    assert STATELESS_MODEL["NO_PER_CONNECTION_STATE"] == "R-4.4-d"

  def test_documents_the_connection_not_conversation_rule(self):
    assert STATELESS_MODEL["CONNECTION_NOT_CONVERSATION"] == "R-4.4-f"

  def test_documents_the_explicit_continuation_only_rule(self):
    assert STATELESS_MODEL["EXPLICIT_CONTINUATION_ONLY"] == "R-4.5-a"

  def test_documents_the_list_results_connection_independent_rule(self):
    assert STATELESS_MODEL["LIST_RESULTS_CONNECTION_INDEPENDENT"] == "R-4.6-a"

  def test_has_exactly_seven_documented_rules(self):
    assert len(STATELESS_MODEL) == 7

  def test_exposes_exactly_the_expected_keys(self):
    assert set(STATELESS_MODEL.keys()) == {
      "NO_PRIOR_REQUEST_INFERENCE",
      "NO_HANDSHAKE_REQUIRED",
      "IDENTITY_FROM_META_ONLY",
      "NO_PER_CONNECTION_STATE",
      "CONNECTION_NOT_CONVERSATION",
      "EXPLICIT_CONTINUATION_ONLY",
      "LIST_RESULTS_CONNECTION_INDEPENDENT",
    }

  def test_every_value_is_a_rule_id_string(self):
    for value in STATELESS_MODEL.values():
      assert isinstance(value, str)
      assert value.startswith("R-4.")


# ─── Cross-call continuity model (AC-06.11–AC-06.14 · R-4.5-a – R-4.5-d) ───────


class TestCrossCallContinuityModel:
  def test_a_server_minted_cursor_is_a_valid_continuation_identifier(self):
    server_minted = "eyJvIjoxMDB9.Zm9vYmFy"
    assert is_valid_continuation_id(server_minted) is True

  def test_the_same_cursor_is_valid_across_connections(self):
    # Both "connections" use the same opaque cursor value — the value carries identity.
    cursor = "cursor-page-2"
    assert is_valid_continuation_id(cursor) is True
    assert is_valid_continuation_id(cursor) is True  # same result on any "instance"

  def test_a_numeric_continuation_id_is_valid(self):
    # Some features mint number handles.
    assert is_valid_continuation_id(12345) is True

  def test_an_object_continuation_id_is_valid(self):
    # Structured but still opaque to the client — only serializability is checked.
    assert is_valid_continuation_id({"taskId": "abc", "shard": 3}) is True

  def test_a_continuation_id_round_trips_through_json(self):
    # The defining property: a valid continuation id can survive JSON encode/decode.
    import json

    for value in ["tok", 42, 3.5, True, None, [1, 2], {"k": "v"}]:
      assert is_valid_continuation_id(value) is True
      assert json.loads(json.dumps(value)) == value


# ─── DEFERRED_TO_TRANSPORT constants (AC-06.8 – AC-06.10) ──────────────────────


class TestDeferredToTransportConstants:
  def test_documents_the_interleaved_task_streams_behavior(self):
    assert DEFERRED_TO_TRANSPORT["INTERLEAVED_TASK_STREAMS"] == "R-4.4-h"

  def test_documents_the_no_connection_reuse_requirement_behavior(self):
    assert DEFERRED_TO_TRANSPORT["NO_CONNECTION_REUSE_REQUIREMENT"] == "R-4.4-i"

  def test_documents_the_mid_task_resume_on_new_connection_behavior(self):
    assert DEFERRED_TO_TRANSPORT["MID_TASK_RESUME_ON_NEW_CONNECTION"] == "R-4.4-j"

  def test_has_exactly_three_entries(self):
    # No undocumented deferrals.
    assert len(DEFERRED_TO_TRANSPORT) == 3

  def test_exposes_exactly_the_expected_keys(self):
    assert set(DEFERRED_TO_TRANSPORT.keys()) == {
      "INTERLEAVED_TASK_STREAMS",
      "NO_CONNECTION_REUSE_REQUIREMENT",
      "MID_TASK_RESUME_ON_NEW_CONNECTION",
    }

  def test_every_value_is_a_should_level_rule_id(self):
    for value in DEFERRED_TO_TRANSPORT.values():
      assert isinstance(value, str)
      assert value.startswith("R-4.4-")


# ─── Rule maps are disjoint and complete (no overlap between MUST and SHOULD) ──


class TestRuleMapsDisjoint:
  def test_no_rule_id_appears_in_both_maps(self):
    assert set(STATELESS_MODEL.values()).isdisjoint(DEFERRED_TO_TRANSPORT.values())
