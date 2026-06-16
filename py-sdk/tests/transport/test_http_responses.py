"""Tests for the Streamable HTTP response half (§9.6–§9.12).

Mirrors the TS conformance suite (AC-15.x) and adds Python-specific edge cases. Every
public export of :mod:`mcp.transport.http.responses` is exercised: response-shape
selection, the single-JSON + event-stream builders, exact SSE byte framing
(``data: ...\\n\\n``), the :class:`RequestEventStream` lifecycle (notification before
final, final terminates, no-send-after-close, cancellation), ``-32001`` HeaderMismatch
objects, the error-code → HTTP-status mapping (incl. ``-32601`` → 404), stateless
header stripping, ``405`` for GET/DELETE, ``Origin`` validation + ``403``, loopback
binding, and the §9.12 backward-compatibility fallback decisions.
"""

import json

import pytest

from mcp.protocol.errors import (
  HEADER_MISMATCH_CODE,
  INTERNAL_ERROR_CODE,
  INVALID_PARAMS_CODE,
  INVALID_REQUEST_CODE,
  METHOD_NOT_FOUND_CODE,
  MISSING_CLIENT_CAPABILITY_CODE,
  PARSE_ERROR_CODE,
  UNSUPPORTED_PROTOCOL_VERSION_CODE,
)
from mcp.transport.http.responses import (
  ALL_INTERFACES_BIND_ADDRESS,
  BAD_REQUEST_STATUS,
  EVENT_STREAM_CONTENT_TYPE,
  EVENT_STREAM_STATUS,
  FORBIDDEN_STATUS,
  LAST_EVENT_ID_HEADER,
  LEGACY_ENDPOINT_EVENT,
  LOOPBACK_BIND_ADDRESS,
  METHOD_NOT_ALLOWED_STATUS,
  NOT_FOUND_STATUS,
  NOTIFICATION_ACCEPTED_STATUS,
  OK_STATUS,
  REVISION_ERROR_CODES,
  SINGLE_JSON_CONTENT_TYPE,
  X_ACCEL_BUFFERING_HEADER,
  X_ACCEL_BUFFERING_VALUE,
  HeaderMismatchCause,
  RequestEventStream,
  ResponseShape,
  build_error_response,
  build_event_stream_headers,
  build_forbidden_origin_response,
  build_header_mismatch_error,
  build_header_mismatch_response,
  build_method_not_found_response,
  build_notification_accepted_response,
  build_single_json_response,
  choose_response_shape,
  format_sse_event,
  header_mismatch_for_cause,
  http_status_for_error_code,
  interpret_post_for_fallback,
  is_legacy_http_sse_server,
  is_session_id_header,
  method_not_allowed_response,
  recommended_local_bind_address,
  strip_ignored_stateless_headers,
  validate_origin,
  validate_stream_message,
)


# ─── Status constants & content types ───────────────────────────────────────────


class TestConstants:
  def test_status_constants(self):
    assert OK_STATUS == 200
    assert FORBIDDEN_STATUS == 403
    assert NOT_FOUND_STATUS == 404
    assert METHOD_NOT_ALLOWED_STATUS == 405
    assert BAD_REQUEST_STATUS == 400
    assert NOTIFICATION_ACCEPTED_STATUS == 202
    assert EVENT_STREAM_STATUS == 200

  def test_content_types_and_headers(self):
    assert SINGLE_JSON_CONTENT_TYPE == "application/json"
    assert EVENT_STREAM_CONTENT_TYPE == "text/event-stream"
    assert X_ACCEL_BUFFERING_HEADER == "X-Accel-Buffering"
    assert X_ACCEL_BUFFERING_VALUE == "no"
    assert LAST_EVENT_ID_HEADER == "Last-Event-ID"

  def test_error_code_values(self):
    assert HEADER_MISMATCH_CODE == -32001
    assert MISSING_CLIENT_CAPABILITY_CODE == -32003
    assert UNSUPPORTED_PROTOCOL_VERSION_CODE == -32004
    assert PARSE_ERROR_CODE == -32700
    assert INVALID_REQUEST_CODE == -32600
    assert METHOD_NOT_FOUND_CODE == -32601
    assert INVALID_PARAMS_CODE == -32602


# ─── Response-shape selection (R-9.6-a) ─────────────────────────────────────────


class TestResponseShape:
  def test_choice(self):
    assert choose_response_shape(False) == ResponseShape.SINGLE_JSON
    assert choose_response_shape(True) == ResponseShape.EVENT_STREAM

  def test_exactly_two_shapes(self):
    assert {ResponseShape.SINGLE_JSON, ResponseShape.EVENT_STREAM} == {"single-json", "event-stream"}

  def test_both_open_with_200(self):
    single = build_single_json_response({"jsonrpc": "2.0", "id": 1, "result": {"resultType": "complete"}})
    assert single.status == OK_STATUS
    assert build_event_stream_headers()["Content-Type"] == EVENT_STREAM_CONTENT_TYPE


# ─── Single JSON response (R-9.6.1-a) ───────────────────────────────────────────


class TestSingleJsonResponse:
  def test_status_headers_body(self):
    res = build_single_json_response({"jsonrpc": "2.0", "id": 7, "result": {"resultType": "complete"}})
    assert res.status == 200
    assert res.headers["Content-Type"] == SINGLE_JSON_CONTENT_TYPE
    assert res.body == {"jsonrpc": "2.0", "id": 7, "result": {"resultType": "complete"}}

  def test_preserves_request_id(self):
    res = build_single_json_response({"jsonrpc": "2.0", "id": "abc", "result": {}})
    assert res.body["id"] == "abc"

  def test_carries_error_response_shape(self):
    res = build_single_json_response({"jsonrpc": "2.0", "id": 3, "error": {"code": -1, "message": "x"}})
    assert res.body["error"]["code"] == -1

  def test_no_session_header_minted(self):
    res = build_single_json_response({"jsonrpc": "2.0", "id": 1, "result": {}})
    assert not any("session" in h.lower() for h in res.headers)


# ─── Event-stream headers (R-9.6.2-a/g) ─────────────────────────────────────────


class TestEventStreamHeaders:
  def test_default_includes_accel_buffering(self):
    headers = build_event_stream_headers()
    assert headers["Content-Type"] == EVENT_STREAM_CONTENT_TYPE
    assert headers[X_ACCEL_BUFFERING_HEADER] == X_ACCEL_BUFFERING_VALUE

  def test_accel_buffering_can_be_omitted(self):
    headers = build_event_stream_headers(False)
    assert X_ACCEL_BUFFERING_HEADER not in headers


# ─── SSE event framing (R-9.6.2-a) ──────────────────────────────────────────────


class TestFormatSseEvent:
  def test_exact_bytes(self):
    msg = {"jsonrpc": "2.0", "id": 1, "result": {"resultType": "complete"}}
    event = format_sse_event(msg)
    assert event == f"data: {json.dumps(msg, separators=(',', ':'))}\n\n"

  def test_terminated_by_blank_line(self):
    event = format_sse_event({"jsonrpc": "2.0", "id": 1, "result": {}})
    assert event.endswith("\n\n")
    assert event.startswith("data: ")

  def test_round_trips_to_one_message(self):
    msg = {"jsonrpc": "2.0", "method": "notifications/progress", "params": {"progress": 1}}
    event = format_sse_event(msg)
    assert json.loads(event[len("data: ") :].rstrip()) == msg

  def test_compact_json_no_spaces(self):
    # The TS JSON.stringify produces no inserted whitespace; the Python form matches.
    event = format_sse_event({"a": 1, "b": 2})
    assert event == 'data: {"a":1,"b":2}\n\n'

  @pytest.mark.parametrize("value", [float("nan"), float("inf"), float("-inf")])
  def test_rejects_non_finite_numbers(self, value):
    # JSON has no NaN/Infinity; the SSE wire encoder refuses to emit one rather than
    # writing the invalid bare token Python's json produces by default. (R-7.1-b)
    with pytest.raises(ValueError):
      format_sse_event({"jsonrpc": "2.0", "id": 1, "result": {"x": value}})


# ─── validate_stream_message (R-9.6.2-c/d) ──────────────────────────────────────


class TestValidateStreamMessage:
  def test_independent_request_forbidden(self):
    result = validate_stream_message({"jsonrpc": "2.0", "method": "sampling/createMessage", "id": 9})
    assert result.ok is False
    assert "MUST NOT" in result.reason

  def test_notification_allowed(self):
    assert validate_stream_message({"jsonrpc": "2.0", "method": "notifications/progress", "params": {}}).ok

  def test_response_allowed(self):
    assert validate_stream_message({"jsonrpc": "2.0", "id": 1, "result": {}}).ok

  def test_non_object_rejected(self):
    assert validate_stream_message("x").ok is False
    assert validate_stream_message(None).ok is False


# ─── RequestEventStream lifecycle (R-9.6.2-c/d/e/f/i/k) ─────────────────────────


class TestRequestEventStream:
  def test_emits_notifications_before_final(self):
    events = []
    stream = RequestEventStream(events.append)
    stream.send_notification(
      {"jsonrpc": "2.0", "method": "notifications/progress", "params": {"progress": 50, "total": 100}}
    )
    stream.send_notification(
      {"jsonrpc": "2.0", "method": "notifications/message", "params": {"level": "info", "data": "q"}}
    )
    assert len(events) == 2
    assert "notifications/progress" in events[0]
    assert "notifications/message" in events[1]
    assert stream.closed is False

  def test_notification_with_id_rejected(self):
    stream = RequestEventStream(lambda e: None)
    with pytest.raises(RuntimeError):
      stream.send_notification({"jsonrpc": "2.0", "method": "notifications/progress", "id": 1})

  def test_final_response_terminates_completed(self):
    events = []
    stream = RequestEventStream(events.append)
    stream.send_final_response({"jsonrpc": "2.0", "id": 1, "result": {"resultType": "complete"}})
    assert stream.closed is True
    assert stream.completed is True
    assert len(events) == 1

  def test_no_send_after_final_response(self):
    stream = RequestEventStream(lambda e: None)
    stream.send_final_response({"jsonrpc": "2.0", "id": 1, "result": {}})
    with pytest.raises(RuntimeError):
      stream.send_notification({"jsonrpc": "2.0", "method": "notifications/progress"})
    with pytest.raises(RuntimeError):
      stream.send_final_response({"jsonrpc": "2.0", "id": 1, "result": {}})

  def test_client_close_closes_without_completing(self):
    stream = RequestEventStream(lambda e: None)
    stream.cancel_by_client_close()
    assert stream.closed is True
    assert stream.completed is False

  def test_no_send_after_client_close(self):
    events = []
    stream = RequestEventStream(events.append)
    stream.cancel_by_client_close()
    with pytest.raises(RuntimeError):
      stream.send_notification({"jsonrpc": "2.0", "method": "notifications/progress"})
    with pytest.raises(RuntimeError):
      stream.send_final_response({"jsonrpc": "2.0", "id": 1, "result": {}})
    assert len(events) == 0

  def test_cancel_is_idempotent(self):
    stream = RequestEventStream(lambda e: None)
    stream.cancel_by_client_close()
    stream.cancel_by_client_close()  # does not raise
    assert stream.closed is True


# ─── HeaderMismatch error object (R-9.8-a/b/c/d) ────────────────────────────────


class TestHeaderMismatch:
  def test_build_default(self):
    err = build_header_mismatch_error()
    assert err["code"] == HEADER_MISMATCH_CODE
    assert "data" not in err

  def test_build_with_message(self):
    err = build_header_mismatch_error("Mcp-Name header value 'foo' does not match body value 'bar'")
    assert err["code"] == -32001
    assert "foo" in err["message"]

  def test_build_with_data(self):
    err = build_header_mismatch_error("m", {"detail": 1})
    assert err["data"] == {"detail": 1}

  def test_response_wraps_400_with_id(self):
    res = build_header_mismatch_response(build_header_mismatch_error(), 1)
    assert res.status == BAD_REQUEST_STATUS
    assert res.body["id"] == 1
    assert res.body["error"]["code"] == -32001

  def test_response_omits_id_when_absent(self):
    res = build_header_mismatch_response(build_header_mismatch_error())
    assert "id" not in res.body

  def test_cause_missing_required_header(self):
    err = header_mismatch_for_cause(HeaderMismatchCause(kind="missing-required-header", header="Mcp-Method"))
    assert err["code"] == -32001
    assert "Mcp-Method" in err["message"]
    assert "missing" in err["message"]

  def test_cause_value_mismatch(self):
    err = header_mismatch_for_cause(
      HeaderMismatchCause(kind="value-mismatch", header="Mcp-Name", header_value="foo", body_value="bar")
    )
    assert err["code"] == -32001
    assert "'foo'" in err["message"]
    assert "'bar'" in err["message"]

  def test_cause_invalid_param_characters(self):
    err = header_mismatch_for_cause(
      HeaderMismatchCause(kind="invalid-param-characters", header="Mcp-Param-Region")
    )
    assert err["code"] == -32001
    assert "invalid characters" in err["message"]

  def test_cause_unknown_kind_raises(self):
    with pytest.raises(ValueError):
      header_mismatch_for_cause(HeaderMismatchCause(kind="bogus", header="X"))


# ─── Generic builders (§9.7) ────────────────────────────────────────────────────


class TestGenericBuilders:
  def test_error_response_with_id(self):
    res = build_error_response(400, {"code": PARSE_ERROR_CODE, "message": "Parse error"}, 5)
    assert res.status == 400
    assert res.headers["Content-Type"] == SINGLE_JSON_CONTENT_TYPE
    assert res.body == {"jsonrpc": "2.0", "id": 5, "error": {"code": PARSE_ERROR_CODE, "message": "Parse error"}}

  def test_error_response_omits_id_when_none(self):
    res = build_error_response(400, {"code": PARSE_ERROR_CODE, "message": "Parse error"})
    assert "id" not in res.body

  def test_method_not_found_response(self):
    res = build_method_not_found_response("tools/teleport", 7)
    assert res.status == NOT_FOUND_STATUS == 404
    assert res.body["jsonrpc"] == "2.0"
    assert res.body["id"] == 7
    assert res.body["error"]["code"] == METHOD_NOT_FOUND_CODE
    assert "tools/teleport" in res.body["error"]["message"]

  def test_method_not_found_without_id(self):
    res = build_method_not_found_response("x")
    assert "id" not in res.body

  def test_notification_accepted_response(self):
    res = build_notification_accepted_response()
    assert res.status == NOTIFICATION_ACCEPTED_STATUS == 202
    assert res.body is None
    assert res.headers == {}


# ─── Status mapping (§9.7) ──────────────────────────────────────────────────────


class TestStatusMapping:
  def test_method_not_found_maps_to_404(self):
    assert http_status_for_error_code(METHOD_NOT_FOUND_CODE) == 404

  @pytest.mark.parametrize(
    "code",
    [PARSE_ERROR_CODE, INVALID_REQUEST_CODE, INVALID_PARAMS_CODE, HEADER_MISMATCH_CODE, INTERNAL_ERROR_CODE],
  )
  def test_other_codes_map_to_400(self, code):
    assert http_status_for_error_code(code) == 400

  def test_revision_error_codes_membership(self):
    assert HEADER_MISMATCH_CODE in REVISION_ERROR_CODES
    assert MISSING_CLIENT_CAPABILITY_CODE in REVISION_ERROR_CODES
    assert UNSUPPORTED_PROTOCOL_VERSION_CODE in REVISION_ERROR_CODES
    assert PARSE_ERROR_CODE in REVISION_ERROR_CODES
    assert INVALID_REQUEST_CODE in REVISION_ERROR_CODES
    assert METHOD_NOT_FOUND_CODE in REVISION_ERROR_CODES
    assert INVALID_PARAMS_CODE in REVISION_ERROR_CODES
    # Internal error is NOT a transport-boundary revision error.
    assert INTERNAL_ERROR_CODE not in REVISION_ERROR_CODES


# ─── Statelessness (§9.9) ───────────────────────────────────────────────────────


class TestStatelessness:
  def test_recognizes_session_headers_case_insensitively(self):
    assert is_session_id_header("Mcp-Session-Id") is True
    assert is_session_id_header("x-session-id") is True
    assert is_session_id_header("session-id") is True
    assert is_session_id_header("Content-Type") is False

  def test_strips_session_id(self):
    stripped = strip_ignored_stateless_headers(
      {"Mcp-Session-Id": "abc", "MCP-Protocol-Version": "2026-07-28"}
    )
    assert "Mcp-Session-Id" not in stripped
    assert stripped["MCP-Protocol-Version"] == "2026-07-28"

  def test_strips_last_event_id_case_insensitively(self):
    assert strip_ignored_stateless_headers({"Last-Event-ID": "42"}) == {}
    assert strip_ignored_stateless_headers({"last-event-id": "7"}) == {}

  def test_keeps_unrelated_headers(self):
    stripped = strip_ignored_stateless_headers({"Content-Type": "application/json", "Last-Event-ID": "1"})
    assert stripped == {"Content-Type": "application/json"}

  def test_does_not_mutate_input(self):
    original = {"Mcp-Session-Id": "abc", "Content-Type": "application/json"}
    strip_ignored_stateless_headers(original)
    assert "Mcp-Session-Id" in original


# ─── 405 for GET/DELETE (R-9.9-f) ───────────────────────────────────────────────


class TestMethodNotAllowed:
  @pytest.mark.parametrize("method", ["GET", "DELETE", "get", "delete", "Put"])
  def test_non_post_returns_405(self, method):
    res = method_not_allowed_response(method)
    assert res is not None
    assert res.status == METHOD_NOT_ALLOWED_STATUS == 405
    assert res.body is None

  @pytest.mark.parametrize("method", ["POST", "post"])
  def test_post_allowed(self, method):
    assert method_not_allowed_response(method) is None


# ─── Origin validation (R-9.11-a/b/c) ───────────────────────────────────────────


class TestOriginValidation:
  def test_absent_origin_accepted(self):
    assert validate_origin(None, ["https://app.example"]).accepted is True

  def test_accepted_origin(self):
    result = validate_origin("https://app.example", ["https://app.example"])
    assert result.accepted is True

  def test_accepts_from_set(self):
    assert validate_origin("https://app.example", {"https://app.example"}).accepted is True

  def test_rejects_unaccepted_origin(self):
    result = validate_origin("https://evil.example", {"https://app.example"})
    assert result.accepted is False
    assert result.origin == "https://evil.example"

  def test_forbidden_response_with_body_no_id(self):
    res = build_forbidden_origin_response()
    assert res.status == FORBIDDEN_STATUS == 403
    assert res.body["jsonrpc"] == "2.0"
    assert "id" not in res.body
    assert res.body["error"]["code"] == INVALID_REQUEST_CODE

  def test_forbidden_response_body_omitted(self):
    res = build_forbidden_origin_response("nope", False)
    assert res.status == 403
    assert res.body is None
    assert res.headers == {}


# ─── Loopback binding (R-9.11-d) ────────────────────────────────────────────────


class TestBinding:
  def test_recommends_loopback(self):
    assert recommended_local_bind_address() == LOOPBACK_BIND_ADDRESS == "127.0.0.1"

  def test_not_all_interfaces(self):
    assert recommended_local_bind_address() != ALL_INTERFACES_BIND_ADDRESS
    assert ALL_INTERFACES_BIND_ADDRESS == "0.0.0.0"


# ─── Backward-compatibility fallback (§9.12) ────────────────────────────────────


class TestPostFallback:
  def test_recognized_revision_error_retries(self):
    decision = interpret_post_for_fallback(
      400, {"jsonrpc": "2.0", "error": {"code": HEADER_MISMATCH_CODE, "message": "mismatch"}}
    )
    assert decision.action == "retry"

  def test_all_revision_codes_retry_on_400(self):
    for code in REVISION_ERROR_CODES:
      decision = interpret_post_for_fallback(400, {"jsonrpc": "2.0", "error": {"code": code, "message": "x"}})
      assert decision.action == "retry"

  def test_retry_carries_supported_when_present(self):
    decision = interpret_post_for_fallback(
      400,
      {
        "jsonrpc": "2.0",
        "error": {
          "code": UNSUPPORTED_PROTOCOL_VERSION_CODE,
          "message": "unsupported",
          "data": {"supported": ["2026-07-28", "2025-11-25"], "requested": "1999-01-01"},
        },
      },
    )
    assert decision.action == "retry"
    assert decision.supported == ["2026-07-28", "2025-11-25"]

  def test_retry_without_supported(self):
    decision = interpret_post_for_fallback(
      400, {"jsonrpc": "2.0", "error": {"code": INVALID_PARAMS_CODE, "message": "bad params"}}
    )
    assert decision.action == "retry"
    assert decision.supported is None

  def test_empty_body_400_legacy_probe(self):
    assert interpret_post_for_fallback(400, None).action == "legacy-probe"

  def test_unrecognized_error_code_400_legacy_probe(self):
    decision = interpret_post_for_fallback(
      400, {"jsonrpc": "2.0", "error": {"code": -32099, "message": "other server error"}}
    )
    assert decision.action == "legacy-probe"

  @pytest.mark.parametrize("status", [400, 404, 405])
  def test_failing_status_unrecognized_body_legacy_probe(self, status):
    assert interpret_post_for_fallback(status, None).action == "legacy-probe"

  def test_non_failing_status_proceeds(self):
    assert interpret_post_for_fallback(200, {"jsonrpc": "2.0", "id": 1, "result": {}}).action == "proceed"

  def test_bool_code_not_treated_as_revision_error(self):
    # A JSON ``true`` is not the int code -32001 even though ``True == 1`` in Python.
    decision = interpret_post_for_fallback(400, {"jsonrpc": "2.0", "error": {"code": True, "message": "x"}})
    assert decision.action == "legacy-probe"

  def test_legacy_endpoint_event_constant(self):
    assert LEGACY_ENDPOINT_EVENT == "endpoint"

  def test_is_legacy_http_sse_server(self):
    assert is_legacy_http_sse_server("endpoint") is True
    assert is_legacy_http_sse_server("message") is False
    assert is_legacy_http_sse_server(None) is False
