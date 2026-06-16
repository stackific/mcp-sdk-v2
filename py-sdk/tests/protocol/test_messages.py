"""Tests for abstract message-kind predicates (§2.2).

Mirrors the TS suite ``src/__tests__/protocol/messages.test.ts`` (S01), AC-mapped:

* AC-01.5  (R-2.2-c) — request and notification are mutually exclusive kinds.
* AC-01.6  (R-2.2-d) — request requires id + method; params optional; null id allowed
  at the abstract level.
* AC-01.7  (R-2.2-e) — notification requires method, has no id; no response sent.
* AC-01.17 (R-2.1-a) — notification predicate ALWAYS rejects a missing method.
* AC-01.18 (R-2.1-b) — ``is_notification`` NEVER returns True when an id is present.
* AC-01.21 (R-2.1-e) — params absence is valid for both kinds.
* AC-01.23 (R-2.1-g) — the core request/notification/error-payload predicates exist.

The Python convention translates each TS Zod ``safeParse(...).success`` into an
``is_valid_*`` predicate; ``.passthrough()`` is mirrored by accepting (ignoring) extra
fields such as the S03 ``jsonrpc`` envelope marker.
"""

from mcp.protocol.messages import (
  is_notification,
  is_request,
  is_valid_abstract_notification,
  is_valid_abstract_request,
  is_valid_error_payload,
)


class TestPredicates:
  def test_is_request(self):
    assert is_request({"id": 1, "method": "m"})
    assert not is_request({"method": "m"})

  def test_is_notification(self):
    assert is_notification({"method": "m"})
    assert not is_notification({"id": 1, "method": "m"})
    assert not is_notification({"id": 1, "result": {}})


# ─── AC-01.6 — is_valid_abstract_request (R-2.2-d) ────────────────────────────


class TestAbstractRequest:
  def test_valid_including_null_id(self):
    # The abstract base permits a null id (R-2.2-d); the concrete wire layer is stricter.
    assert is_valid_abstract_request({"id": None, "method": "m"})
    assert is_valid_abstract_request({"id": 1, "method": "m", "params": {}})
    assert is_valid_abstract_request({"id": "x", "method": "m"})

  def test_request_with_id_and_method_params_optional(self):
    assert is_valid_abstract_request({"id": 1, "method": "tools/list"})

  def test_request_with_numeric_id_method_and_params(self):
    assert is_valid_abstract_request(
      {"id": 42, "method": "resources/read", "params": {"uri": "file:///readme.txt"}}
    )

  def test_request_with_string_id(self):
    assert is_valid_abstract_request({"id": "req-1", "method": "prompts/list"})

  def test_request_with_null_id_valid_json_rpc(self):
    assert is_valid_abstract_request({"id": None, "method": "ping"})

  def test_invalid(self):
    assert not is_valid_abstract_request({"method": "m"})  # no id
    assert not is_valid_abstract_request({"id": 1})  # no method
    assert not is_valid_abstract_request({"id": True, "method": "m"})  # bool id
    assert not is_valid_abstract_request({"id": 1, "method": "m", "params": []})

  def test_rejects_when_id_absent(self):
    assert not is_valid_abstract_request({"method": "tools/list"})

  def test_rejects_when_method_absent(self):
    assert not is_valid_abstract_request({"id": 1})

  def test_rejects_non_string_method(self):
    assert not is_valid_abstract_request({"id": 1, "method": 7})

  def test_passes_through_extra_fields(self):
    # `.passthrough()`: the S03 concrete envelope (e.g. `jsonrpc`) may extend the shape.
    assert is_valid_abstract_request({"jsonrpc": "2.0", "id": 1, "method": "tools/list"})

  def test_non_object_rejected(self):
    assert not is_valid_abstract_request(None)
    assert not is_valid_abstract_request("nope")
    assert not is_valid_abstract_request([1, 2])


# ─── AC-01.7 — is_valid_abstract_notification (R-2.2-e) ───────────────────────


class TestAbstractNotification:
  def test_valid(self):
    assert is_valid_abstract_notification({"method": "m"})
    assert is_valid_abstract_notification({"method": "m", "params": {}})

  def test_notification_with_method_only(self):
    assert is_valid_abstract_notification({"method": "notifications/progress"})

  def test_notification_with_method_and_params(self):
    assert is_valid_abstract_notification(
      {"method": "notifications/cancelled", "params": {"requestId": 1}}
    )

  def test_rejects_when_method_absent(self):
    # AC-01.17 (MUST = absolute): there is no input for which a methodless object is a
    # valid notification.
    assert not is_valid_abstract_notification({"params": {}})
    assert not is_valid_abstract_notification({})

  def test_invalid(self):
    assert not is_valid_abstract_notification({"id": 1, "method": "m"})
    assert not is_valid_abstract_notification({"params": {}})

  def test_rejects_when_id_present(self):
    # A notification has no id; presence of id disqualifies it.
    assert not is_valid_abstract_notification({"id": 1, "method": "m"})
    assert not is_valid_abstract_notification({"id": None, "method": "m"})

  def test_rejects_non_object_params(self):
    assert not is_valid_abstract_notification({"method": "m", "params": []})

  def test_passes_through_extra_fields(self):
    assert is_valid_abstract_notification({"jsonrpc": "2.0", "method": "notifications/progress"})

  def test_non_object_rejected(self):
    assert not is_valid_abstract_notification(None)
    assert not is_valid_abstract_notification(42)


# ─── AC-01.5 / AC-01.18 / AC-01.21 — predicate behaviour ──────────────────────


class TestRequestNotificationPredicates:
  def test_is_request_true_when_id_present(self):
    assert is_request({"id": 1, "method": "tools/list"})

  def test_is_request_false_when_id_absent(self):
    assert not is_request({"method": "notifications/progress"})

  def test_is_notification_true_when_method_present_id_absent(self):
    assert is_notification({"method": "notifications/progress"})

  def test_is_notification_false_when_id_present(self):
    assert not is_notification({"id": 1, "method": "tools/list"})

  def test_is_notification_false_when_method_absent(self):
    assert not is_notification({"params": {}})

  def test_request_and_notification_mutually_exclusive(self):
    # AC-01.5 (R-2.2-c) / AC-01.18 (R-2.1-b): a single object satisfies at most one.
    with_id = {"id": 1, "method": "tools/list"}
    without_id = {"method": "notifications/progress"}
    assert not (is_request(with_id) and is_notification(with_id))
    assert not (is_request(without_id) and is_notification(without_id))

  def test_params_absence_valid_for_both_kinds(self):
    # AC-01.21 (R-2.1-e — MAY): both predicates work regardless of params presence.
    assert is_request({"id": 1, "method": "ping"})
    assert is_notification({"method": "ping"})


# ─── §2.2 — is_valid_error_payload ────────────────────────────────────────────


class TestErrorPayload:
  def test_valid(self):
    assert is_valid_error_payload({"code": -32600, "message": "x"})
    assert is_valid_error_payload({"code": -1, "message": "x", "data": {}})

  def test_parses_error_with_code_and_message(self):
    assert is_valid_error_payload({"code": -32600, "message": "Invalid Request"})

  def test_parses_error_with_optional_data(self):
    assert is_valid_error_payload({"code": -32700, "message": "Parse error", "data": {"raw": "..."}})

  def test_rejects_when_code_absent(self):
    assert not is_valid_error_payload({"message": "oops"})

  def test_rejects_when_message_absent(self):
    assert not is_valid_error_payload({"code": -32600})

  def test_rejects_non_integer_code(self):
    assert not is_valid_error_payload({"code": 1.5, "message": "bad"})

  def test_invalid(self):
    assert not is_valid_error_payload({"code": "x", "message": "y"})
    assert not is_valid_error_payload({"code": True, "message": "y"})  # bool is not an int code
    assert not is_valid_error_payload({"message": "y"})

  def test_non_object_rejected(self):
    assert not is_valid_error_payload(None)
    assert not is_valid_error_payload([{"code": -1, "message": "x"}])
