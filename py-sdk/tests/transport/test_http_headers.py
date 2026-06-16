"""Tests for Streamable HTTP request framing, headers & routing (§9.1–§9.4).

Mirrors the TS conformance suite (AC-14.x) and adds Python-specific edge cases. Every
public export of :mod:`mcp.transport.http.headers` is exercised, including
case-insensitive header access, ``Content-Type`` with parameters, ``Accept`` missing a
media type, ``Mcp-Name`` required/forbidden per method + mismatch, protocol-version
header absence/mismatch/unsupported, routing-header validation, and the notification
response shape.
"""

import pytest

from mcp.protocol.errors import (
  HEADER_MISMATCH_CODE,
  UNSUPPORTED_PROTOCOL_VERSION_CODE,
)
from mcp.protocol.meta import PROTOCOL_VERSION_META_KEY
from mcp.transport.http.headers import (
  ACCEPT_HEADER,
  ACCEPT_MEDIA_TYPES,
  BAD_REQUEST_STATUS,
  CONTENT_TYPE_HEADER,
  CONTENT_TYPE_JSON,
  MCP_ENDPOINT_HTTP_METHOD,
  MCP_METHOD_HEADER,
  MCP_NAME_HEADER,
  MCP_NAME_METHODS,
  MCP_PARAM_HEADER_PREFIX,
  MCP_PROTOCOL_VERSION_HEADER,
  NOTIFICATION_ACCEPTED_STATUS,
  BuildPostHeadersOptions,
  ProtocolVersionValidationOptions,
  build_header_mismatch,
  build_post_headers,
  get_header,
  has_header,
  is_param_header,
  method_requires_mcp_name,
  notification_http_response,
  routing_name_for,
  validate_accept,
  validate_content_type,
  validate_http_method,
  validate_post_body_framing,
  validate_protocol_version_header,
  validate_routing_headers,
)

PV = "2026-07-28"
META = {PROTOCOL_VERSION_META_KEY: PV}


def tools_call_body(name="execute_sql", arguments=None):
  if arguments is None:
    arguments = {"query": "SELECT 1"}
  return {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {"name": name, "arguments": arguments, "_meta": META},
  }


# ─── Constants ─────────────────────────────────────────────────────────────────


class TestConstants:
  def test_endpoint_method_is_post(self):
    assert MCP_ENDPOINT_HTTP_METHOD == "POST"

  def test_header_names(self):
    assert CONTENT_TYPE_HEADER == "Content-Type"
    assert ACCEPT_HEADER == "Accept"
    assert MCP_METHOD_HEADER == "Mcp-Method"
    assert MCP_NAME_HEADER == "Mcp-Name"
    assert MCP_PARAM_HEADER_PREFIX == "Mcp-Param-"
    assert MCP_PROTOCOL_VERSION_HEADER == "MCP-Protocol-Version"

  def test_content_type_and_accept_media_types(self):
    assert CONTENT_TYPE_JSON == "application/json"
    assert list(ACCEPT_MEDIA_TYPES) == ["application/json", "text/event-stream"]

  def test_status_and_code_constants(self):
    assert NOTIFICATION_ACCEPTED_STATUS == 202
    assert BAD_REQUEST_STATUS == 400
    assert HEADER_MISMATCH_CODE == -32001

  def test_mcp_name_methods(self):
    assert MCP_NAME_METHODS == frozenset({"tools/call", "resources/read", "prompts/get"})


# ─── Case-insensitive header access (R-9.3-a/b) ─────────────────────────────────


class TestHeaderAccess:
  def test_get_header_case_insensitive_name(self):
    assert get_header({"content-type": "application/json"}, "Content-Type") == "application/json"
    assert get_header({"CONTENT-TYPE": "application/json"}, "content-type") == "application/json"

  def test_get_header_returns_value_verbatim(self):
    # The value's case is preserved; only the name is matched case-insensitively.
    assert get_header({"Mcp-Method": "Tools/Call"}, "mcp-method") == "Tools/Call"

  def test_get_header_absent_returns_none(self):
    assert get_header({"Accept": "x"}, "Content-Type") is None
    assert get_header({}, "anything") is None

  def test_has_header(self):
    assert has_header({"Accept": "x"}, "accept") is True
    assert has_header({"Accept": "x"}, "Content-Type") is False

  def test_is_param_header(self):
    assert is_param_header("Mcp-Param-Region") is True
    assert is_param_header("mcp-param-region") is True  # case-insensitive
    assert is_param_header("Mcp-Method") is False
    assert is_param_header("Mcp-Name") is False


# ─── Body framing (R-9.1-b, R-9.2-c/d/e) ────────────────────────────────────────


class TestBodyFraming:
  def test_accepts_single_request(self):
    result = validate_post_body_framing(tools_call_body())
    assert result.ok is True
    assert result.kind == "request"

  def test_accepts_single_notification(self):
    result = validate_post_body_framing(
      {"jsonrpc": "2.0", "method": "notifications/progress", "params": {"_meta": META}}
    )
    assert result.ok is True
    assert result.kind == "notification"

  def test_rejects_response(self):
    result = validate_post_body_framing({"jsonrpc": "2.0", "id": 1, "result": {"resultType": "complete"}})
    assert result.ok is False
    assert "response" in result.reason

  def test_rejects_error_response(self):
    result = validate_post_body_framing({"jsonrpc": "2.0", "id": 1, "error": {"code": -1, "message": "x"}})
    assert result.ok is False

  def test_rejects_batch_array(self):
    result = validate_post_body_framing([tools_call_body()])
    assert result.ok is False
    assert result.reason  # carries a malformed reason

  def test_rejects_malformed_non_object(self):
    assert validate_post_body_framing("not an object").ok is False
    assert validate_post_body_framing(None).ok is False

  def test_rejects_missing_jsonrpc(self):
    assert validate_post_body_framing({"id": 1, "method": "x"}).ok is False


# ─── HTTP method (R-9.2-a/b) ────────────────────────────────────────────────────


class TestHttpMethod:
  def test_post_accepted(self):
    assert validate_http_method("POST").ok is True

  def test_post_case_insensitive(self):
    assert validate_http_method("post").ok is True

  @pytest.mark.parametrize("method", ["GET", "DELETE", "PUT", "PATCH", "HEAD"])
  def test_non_post_rejected(self, method):
    result = validate_http_method(method)
    assert result.ok is False
    assert result.rejection.status == 400
    assert result.rejection.error["code"] == HEADER_MISMATCH_CODE


# ─── Content-Type (R-9.3.1-a) ───────────────────────────────────────────────────


class TestContentType:
  def test_accepts_plain(self):
    assert validate_content_type({"Content-Type": "application/json"}).ok is True

  def test_accepts_with_charset_param(self):
    assert validate_content_type({"Content-Type": "application/json; charset=utf-8"}).ok is True

  def test_accepts_case_insensitive_media_type(self):
    assert validate_content_type({"Content-Type": "Application/JSON"}).ok is True

  def test_accepts_case_insensitive_name(self):
    assert validate_content_type({"content-type": "application/json"}).ok is True

  def test_rejects_other_media_type(self):
    result = validate_content_type({"Content-Type": "text/plain"})
    assert result.ok is False
    assert result.rejection.error["code"] == HEADER_MISMATCH_CODE

  def test_rejects_missing(self):
    assert validate_content_type({}).ok is False


# ─── Accept (R-9.3.2-a/b) ───────────────────────────────────────────────────────


class TestAccept:
  def test_accepts_both(self):
    assert validate_accept({"Accept": "application/json, text/event-stream"}).ok is True

  def test_accepts_both_with_q_params(self):
    assert validate_accept({"Accept": "application/json;q=0.9, text/event-stream;q=0.8"}).ok is True

  def test_accepts_case_insensitive(self):
    assert validate_accept({"accept": "APPLICATION/JSON, TEXT/EVENT-STREAM"}).ok is True

  def test_rejects_only_json(self):
    result = validate_accept({"Accept": "application/json"})
    assert result.ok is False
    assert result.rejection.error["code"] == HEADER_MISMATCH_CODE

  def test_rejects_only_event_stream(self):
    assert validate_accept({"Accept": "text/event-stream"}).ok is False

  def test_rejects_missing(self):
    assert validate_accept({}).ok is False


# ─── POST header construction (§9.2-f, §9.3, §9.4) ──────────────────────────────


class TestBuildPostHeaders:
  def test_required_headers_present(self):
    headers = build_post_headers(BuildPostHeadersOptions(protocol_version=PV, method="tools/list"))
    assert get_header(headers, CONTENT_TYPE_HEADER) == CONTENT_TYPE_JSON
    assert get_header(headers, MCP_PROTOCOL_VERSION_HEADER) == PV
    assert get_header(headers, MCP_METHOD_HEADER) == "tools/list"

  def test_accept_lists_both_media_types(self):
    headers = build_post_headers(BuildPostHeadersOptions(protocol_version=PV, method="tools/list"))
    accept = get_header(headers, ACCEPT_HEADER)
    assert "application/json" in accept
    assert "text/event-stream" in accept

  def test_mcp_name_for_targeted_method(self):
    headers = build_post_headers(
      BuildPostHeadersOptions(protocol_version=PV, method="tools/call", params={"name": "execute_sql"})
    )
    assert get_header(headers, MCP_NAME_HEADER) == "execute_sql"

  def test_no_mcp_name_for_untargeted_method(self):
    headers = build_post_headers(
      BuildPostHeadersOptions(protocol_version=PV, method="tools/list", params={"cursor": "c"})
    )
    assert get_header(headers, MCP_NAME_HEADER) is None

  def test_resources_read_uses_uri(self):
    headers = build_post_headers(
      BuildPostHeadersOptions(protocol_version=PV, method="resources/read", params={"uri": "file:///a"})
    )
    assert get_header(headers, MCP_NAME_HEADER) == "file:///a"

  def test_param_headers_merged(self):
    headers = build_post_headers(
      BuildPostHeadersOptions(
        protocol_version=PV,
        method="tools/call",
        params={"name": "t"},
        param_headers={"Mcp-Param-Region": "us-west1"},
      )
    )
    assert headers["Mcp-Param-Region"] == "us-west1"


# ─── Routing-name resolution (R-9.4.2-b/c/d) ────────────────────────────────────


class TestRoutingName:
  def test_method_requires_mcp_name(self):
    assert method_requires_mcp_name("tools/call") is True
    assert method_requires_mcp_name("prompts/get") is True
    assert method_requires_mcp_name("resources/read") is True
    assert method_requires_mcp_name("tools/list") is False

  def test_tools_call_uses_name(self):
    assert routing_name_for("tools/call", {"name": "execute_sql"}) == "execute_sql"

  def test_prompts_get_uses_name(self):
    assert routing_name_for("prompts/get", {"name": "greet"}) == "greet"

  def test_resources_read_uses_uri(self):
    assert routing_name_for("resources/read", {"uri": "file:///a"}) == "file:///a"

  def test_untargeted_method_returns_none(self):
    assert routing_name_for("tools/list", {}) is None

  def test_none_params_returns_none(self):
    assert routing_name_for("tools/call", None) is None

  def test_non_string_field_returns_none(self):
    assert routing_name_for("tools/call", {"name": 42}) is None
    assert routing_name_for("resources/read", {"uri": None}) is None

  def test_missing_field_returns_none(self):
    assert routing_name_for("tools/call", {"arguments": {}}) is None


# ─── Protocol-version header (§9.3.3) ───────────────────────────────────────────


class TestProtocolVersionHeader:
  def test_accepts_matching_supported(self):
    result = validate_protocol_version_header(
      {"MCP-Protocol-Version": PV},
      tools_call_body(),
      ProtocolVersionValidationOptions(supported_versions=[PV]),
    )
    assert result.ok is True
    assert result.version == PV

  def test_accepts_when_body_has_no_meta_version(self):
    # No body _meta version to disagree with → only supported-set check applies.
    body = {"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}}
    result = validate_protocol_version_header(
      {"MCP-Protocol-Version": PV}, body, ProtocolVersionValidationOptions(supported_versions=[PV])
    )
    assert result.ok is True
    assert result.version == PV

  def test_absent_header_rejected_by_default(self):
    result = validate_protocol_version_header(
      {}, tools_call_body(), ProtocolVersionValidationOptions(supported_versions=[PV])
    )
    assert result.ok is False
    assert result.rejection.status == 400
    assert result.rejection.error["code"] == HEADER_MISMATCH_CODE

  def test_absent_header_treated_as_earliest_when_supported(self):
    result = validate_protocol_version_header(
      {},
      tools_call_body(),
      ProtocolVersionValidationOptions(
        supported_versions=[PV, "2025-03-26"],
        supports_pre_header_clients=True,
        earliest_revision="2025-03-26",
      ),
    )
    assert result.ok is True
    assert result.version == "2025-03-26"

  def test_absent_header_pre_header_without_earliest_still_rejects(self):
    # supports_pre_header_clients is set but no earliest_revision → reject.
    result = validate_protocol_version_header(
      {},
      tools_call_body(),
      ProtocolVersionValidationOptions(supported_versions=[PV], supports_pre_header_clients=True),
    )
    assert result.ok is False
    assert result.rejection.error["code"] == HEADER_MISMATCH_CODE

  def test_header_body_mismatch_rejected(self):
    result = validate_protocol_version_header(
      {"MCP-Protocol-Version": "2025-03-26"},
      tools_call_body(),
      ProtocolVersionValidationOptions(supported_versions=[PV, "2025-03-26"]),
    )
    assert result.ok is False
    assert result.rejection.error["code"] == HEADER_MISMATCH_CODE
    assert "does not match" in result.rejection.error["message"]

  def test_unsupported_version_rejected_with_32004(self):
    body = {
      "jsonrpc": "2.0",
      "id": 1,
      "method": "tools/list",
      "params": {"_meta": {PROTOCOL_VERSION_META_KEY: "2099-01-01"}},
    }
    result = validate_protocol_version_header(
      {"MCP-Protocol-Version": "2099-01-01"},
      body,
      ProtocolVersionValidationOptions(supported_versions=[PV]),
    )
    assert result.ok is False
    assert result.rejection.status == 400
    assert result.rejection.error["code"] == UNSUPPORTED_PROTOCOL_VERSION_CODE
    assert result.rejection.error["data"] == {"supported": [PV], "requested": "2099-01-01"}

  def test_header_name_case_insensitive(self):
    result = validate_protocol_version_header(
      {"mcp-protocol-version": PV},
      tools_call_body(),
      ProtocolVersionValidationOptions(supported_versions=[PV]),
    )
    assert result.ok is True


# ─── Routing headers (§9.4) ─────────────────────────────────────────────────────


class TestRoutingHeaders:
  def test_accepts_exact_method_and_name(self):
    body = tools_call_body()
    result = validate_routing_headers({"Mcp-Method": "tools/call", "Mcp-Name": "execute_sql"}, body)
    assert result.ok is True

  def test_method_compared_case_sensitively(self):
    body = tools_call_body()
    result = validate_routing_headers({"Mcp-Method": "Tools/Call", "Mcp-Name": "execute_sql"}, body)
    assert result.ok is False
    assert result.rejection.error["code"] == HEADER_MISMATCH_CODE

  def test_mcp_method_required(self):
    body = {"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {"_meta": META}}
    result = validate_routing_headers({}, body)
    assert result.ok is False
    assert "required" in result.rejection.error["message"]

  def test_method_mismatch_rejected(self):
    body = {"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {"_meta": META}}
    assert validate_routing_headers({"Mcp-Method": "tools/LIST"}, body).ok is False

  def test_untargeted_method_accepts_without_name(self):
    body = {"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {"_meta": META}}
    assert validate_routing_headers({"Mcp-Method": "tools/list"}, body).ok is True

  def test_mcp_name_required_for_targeted(self):
    body = tools_call_body()
    result = validate_routing_headers({"Mcp-Method": "tools/call"}, body)
    assert result.ok is False
    assert "required" in result.rejection.error["message"]

  def test_mcp_name_mismatch_rejected(self):
    body = tools_call_body()
    result = validate_routing_headers({"Mcp-Method": "tools/call", "Mcp-Name": "wrong_tool"}, body)
    assert result.ok is False
    assert result.rejection.status == 400
    assert result.rejection.error["code"] == HEADER_MISMATCH_CODE

  def test_mcp_name_forbidden_on_untargeted(self):
    body = {"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {"_meta": META}}
    result = validate_routing_headers({"Mcp-Method": "tools/list", "Mcp-Name": "x"}, body)
    assert result.ok is False
    assert "MUST NOT" in result.rejection.error["message"]

  def test_resources_read_matches_uri(self):
    body = {
      "jsonrpc": "2.0",
      "id": 1,
      "method": "resources/read",
      "params": {"uri": "file:///a", "_meta": META},
    }
    assert validate_routing_headers({"Mcp-Method": "resources/read", "Mcp-Name": "file:///a"}, body).ok is True
    assert (
      validate_routing_headers({"Mcp-Method": "resources/read", "Mcp-Name": "file:///b"}, body).ok is False
    )

  def test_targeted_method_missing_params_name_rejected(self):
    # The body declares tools/call but params lacks a name → expected is None → reject.
    body = {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"_meta": META}}
    result = validate_routing_headers({"Mcp-Method": "tools/call", "Mcp-Name": "x"}, body)
    assert result.ok is False

  def test_non_object_body_rejected(self):
    assert validate_routing_headers({"Mcp-Method": "x"}, "not an object").ok is False

  def test_body_without_method_rejected(self):
    assert validate_routing_headers({"Mcp-Method": "x"}, {"jsonrpc": "2.0", "id": 1}).ok is False

  def test_header_name_case_insensitive(self):
    body = tools_call_body()
    assert validate_routing_headers({"mcp-method": "tools/call", "mcp-name": "execute_sql"}, body).ok is True


# ─── build_header_mismatch ──────────────────────────────────────────────────────


class TestBuildHeaderMismatch:
  def test_default_message(self):
    rej = build_header_mismatch()
    assert rej.status == 400
    assert rej.error == {"code": HEADER_MISMATCH_CODE, "message": "Header does not match request body"}

  def test_custom_message(self):
    rej = build_header_mismatch("custom reason")
    assert rej.error["message"] == "custom reason"


# ─── Notification response (R-9.2-g/h/i) ────────────────────────────────────────


class TestNotificationResponse:
  def test_accepted_202_no_body(self):
    res = notification_http_response(True)
    assert res.status == NOTIFICATION_ACCEPTED_STATUS
    assert res.body is None

  def test_rejected_default_400_idless_error_body(self):
    res = notification_http_response(False, {"error": {"code": -32600, "message": "bad"}})
    assert res.status == 400
    assert res.body == {"jsonrpc": "2.0", "error": {"code": -32600, "message": "bad"}}
    assert "id" not in res.body

  def test_rejected_custom_status(self):
    res = notification_http_response(False, {"status": 422, "error": {"code": -1, "message": "x"}})
    assert res.status == 422

  def test_rejected_without_rejection_object(self):
    res = notification_http_response(False)
    assert res.status == 400
    assert res.body is None
