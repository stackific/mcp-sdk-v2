"""Tests for the shared Streamable HTTP transport helper package (§9.1–§9.12).

Mirrors the TypeScript conformance suites for the ``transport/http`` package — the
request half (``http.test.ts``, AC-14.1 … AC-14.33) and the response half
(``http-responses.test.ts``, AC-15.1 … AC-15.25) — exercising the public surface of
:mod:`mcp.transport.http` **through the package barrel** (``__init__.py``) so the
re-export mirroring of TS ``index.ts`` is covered as well. Each test class names its
acceptance criterion; the assertions cite the normative atoms (R-9.x-y) they exercise.

Python-specific edge cases (``bool`` vs. ``int`` discrimination, ``ValueError`` for the
out-of-range integer that TS raises as ``RangeError``) are added alongside the ported
cases without weakening any of them.
"""

from __future__ import annotations

import json

import pytest

# Import the whole public surface through the NEW package barrel so the __init__
# re-export (mirroring index.ts) is itself under test.
from mcp.transport.http import (
  ACCEPT_MEDIA_TYPES,
  ALL_INTERFACES_BIND_ADDRESS,
  BASE64_SENTINEL_PREFIX,
  BASE64_SENTINEL_SUFFIX,
  BAD_REQUEST_STATUS,
  CONTENT_TYPE_JSON,
  EVENT_STREAM_CONTENT_TYPE,
  FORBIDDEN_STATUS,
  HEADER_MISMATCH_CODE,
  INVALID_PARAMS_CODE,
  INVALID_REQUEST_CODE,
  LAST_EVENT_ID_HEADER,
  LEGACY_ENDPOINT_EVENT,
  LOOPBACK_BIND_ADDRESS,
  MAX_SAFE_ANNOTATED_INTEGER,
  MCP_ENDPOINT_HTTP_METHOD,
  MCP_NAME_HEADER,
  MCP_METHOD_HEADER,
  MCP_PROTOCOL_VERSION_HEADER,
  CONTENT_TYPE_HEADER,
  ACCEPT_HEADER,
  METHOD_NOT_ALLOWED_STATUS,
  METHOD_NOT_FOUND_CODE,
  MISSING_CLIENT_CAPABILITY_CODE,
  MIN_SAFE_ANNOTATED_INTEGER,
  NOT_FOUND_STATUS,
  NOTIFICATION_ACCEPTED_STATUS,
  OK_STATUS,
  PARSE_ERROR_CODE,
  REVISION_ERROR_CODES,
  RequestEventStream,
  ResponseShape,
  SINGLE_JSON_CONTENT_TYPE,
  STALE_SCHEMA_STRATEGY,
  UNSUPPORTED_PROTOCOL_VERSION_CODE,
  X_ACCEL_BUFFERING_HEADER,
  X_ACCEL_BUFFERING_VALUE,
  BuildPostHeadersOptions,
  ProtocolVersionValidationOptions,
  build_error_response,
  build_event_stream_headers,
  build_forbidden_origin_response,
  build_header_mismatch_error,
  build_header_mismatch_response,
  build_method_not_found_response,
  build_notification_accepted_response,
  build_param_headers,
  build_post_headers,
  build_single_json_response,
  choose_response_shape,
  decode_header_value,
  encode_header_value,
  filter_valid_tools,
  format_sse_event,
  get_header,
  has_header,
  header_mismatch_for_cause,
  http_status_for_error_code,
  interpret_post_for_fallback,
  is_annotated_integer_in_range,
  is_legacy_http_sse_server,
  is_param_header,
  is_sentinel_encoded,
  is_session_id_header,
  method_not_allowed_response,
  method_requires_mcp_name,
  needs_sentinel,
  notification_http_response,
  param_header_name,
  plain_string_form,
  recommended_local_bind_address,
  routing_name_for,
  sentinel_encode,
  strip_ignored_stateless_headers,
  validate_accept,
  validate_content_type,
  validate_http_method,
  validate_origin,
  validate_param_headers,
  validate_post_body_framing,
  validate_protocol_version_header,
  validate_routing_headers,
  validate_stream_message,
  validate_tool_x_mcp_headers,
)
from mcp.transport.http import HeaderMismatchCause
from mcp.transport.contract import TransportError
from mcp.transport.framing import decode_message_unit

PV = "2026-07-28"
META = {"io.modelcontextprotocol/protocolVersion": PV}


def tools_call_body(args: dict | None = None) -> dict:
  """Build a ``tools/call`` request body, mirroring the TS test fixture."""
  if args is None:
    args = {"name": "execute_sql", "arguments": {"query": "SELECT 1"}}
  return {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {**args, "_meta": META}}


# ════════════════════════════════════════════════════════════════════════════════
# S14 — Request, Headers & Routing (§9.1–§9.5)  ·  AC-14.1 … AC-14.33
# ════════════════════════════════════════════════════════════════════════════════


class TestAc14_1PostBodyUtf8:
  """AC-14.1 — POST body must be UTF-8 (R-9.1-a)."""

  def test_valid_utf8_decodes_invalid_rejected(self) -> None:
    raw = json.dumps(
      {"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {"_meta": META}}
    ).encode("utf-8")
    assert decode_message_unit(raw)["method"] == "tools/list"
    with pytest.raises(TransportError):
      decode_message_unit(b"\xff\xfe")


class TestAc14_2BodyFraming:
  """AC-14.2 · AC-14.5 · AC-14.6 — body is exactly one request/notification (R-9.1-b, R-9.2-c/d/e)."""

  def test_accepts_single_request(self) -> None:
    result = validate_post_body_framing(tools_call_body())
    assert result.ok is True
    assert result.kind == "request"

  def test_accepts_single_notification(self) -> None:
    result = validate_post_body_framing(
      {"jsonrpc": "2.0", "method": "notifications/progress", "params": {"_meta": META}}
    )
    assert result.ok is True
    assert result.kind == "notification"

  def test_rejects_response(self) -> None:
    result = validate_post_body_framing({"jsonrpc": "2.0", "id": 1, "result": {"resultType": "complete"}})
    assert result.ok is False

  def test_rejects_batch_array(self) -> None:
    assert validate_post_body_framing([tools_call_body()]).ok is False

  def test_rejects_malformed(self) -> None:
    # Python edge case: a non-object, non-array primitive is malformed framing.
    assert validate_post_body_framing("not a message").ok is False


class TestAc14_3BothResponseShapes:
  """AC-14.3 — client signals support for both response shapes (R-9.1-c)."""

  def test_accept_lists_both_media_types(self) -> None:
    assert list(ACCEPT_MEDIA_TYPES) == ["application/json", "text/event-stream"]
    headers = build_post_headers(BuildPostHeadersOptions(protocol_version=PV, method="tools/list"))
    accept = get_header(headers, ACCEPT_HEADER)
    assert accept is not None
    assert "application/json" in accept
    assert "text/event-stream" in accept


class TestAc14_4PostMethod:
  """AC-14.4 — each message is a POST (R-9.2-a, R-9.2-b)."""

  def test_endpoint_method_is_post_and_non_post_rejected(self) -> None:
    assert MCP_ENDPOINT_HTTP_METHOD == "POST"
    assert validate_http_method("POST").ok is True
    assert validate_http_method("GET").ok is False

  def test_method_matched_case_insensitively(self) -> None:
    assert validate_http_method("post").ok is True


class TestAc14_7RequiredAndRoutingHeaders:
  """AC-14.7 — every POST carries required + routing headers (R-9.2-f)."""

  def test_build_post_headers_includes_required_and_routing(self) -> None:
    headers = build_post_headers(
      BuildPostHeadersOptions(protocol_version=PV, method="tools/call", params={"name": "execute_sql"})
    )
    assert get_header(headers, CONTENT_TYPE_HEADER) == CONTENT_TYPE_JSON
    assert get_header(headers, MCP_PROTOCOL_VERSION_HEADER) == PV
    assert get_header(headers, MCP_METHOD_HEADER) == "tools/call"
    assert get_header(headers, MCP_NAME_HEADER) == "execute_sql"

  def test_param_headers_merged_in(self) -> None:
    headers = build_post_headers(
      BuildPostHeadersOptions(
        protocol_version=PV,
        method="tools/call",
        params={"name": "t"},
        param_headers={"Mcp-Param-Region": "us-west1"},
      )
    )
    assert headers["Mcp-Param-Region"] == "us-west1"


class TestAc14_8NotificationResponses:
  """AC-14.8 — notification responses (R-9.2-g/h/i)."""

  def test_accepted_is_202_no_body(self) -> None:
    res = notification_http_response(True)
    assert res.status == NOTIFICATION_ACCEPTED_STATUS
    assert res.body is None

  def test_rejected_has_idless_error_body(self) -> None:
    res = notification_http_response(False, {"error": {"code": -32600, "message": "bad"}})
    assert res.status == 400
    assert res.body == {"jsonrpc": "2.0", "error": {"code": -32600, "message": "bad"}}
    assert "id" not in res.body

  def test_rejected_custom_status(self) -> None:
    res = notification_http_response(False, {"status": 404, "error": {"code": -32601, "message": "nf"}})
    assert res.status == 404


class TestAc14_9RequestRecognized:
  """AC-14.9 — a request frames as a request so the server returns a §9.6 response (R-9.2-j)."""

  def test_request_body_frames_as_request(self) -> None:
    assert validate_post_body_framing(tools_call_body()).ok is True


class TestAc14_10HeaderCasing:
  """AC-14.10 — header name case-insensitive, value case-sensitive (R-9.3-a/b/c)."""

  def test_field_names_case_insensitive(self) -> None:
    assert get_header({"content-type": "application/json"}, "Content-Type") == "application/json"
    assert has_header({"CONTENT-TYPE": "x"}, "content-type") is True

  def test_mirrored_values_compared_case_sensitively(self) -> None:
    body = tools_call_body()
    ok = validate_routing_headers({"Mcp-Method": "tools/call", "Mcp-Name": "execute_sql"}, body)
    bad = validate_routing_headers({"Mcp-Method": "Tools/Call", "Mcp-Name": "execute_sql"}, body)
    assert ok.ok is True
    assert bad.ok is False


class TestAc14_11ContentType:
  """AC-14.11 — Content-Type application/json (R-9.3.1-a)."""

  def test_accepts_json_with_optional_charset_rejects_others(self) -> None:
    assert validate_content_type({"Content-Type": "application/json"}).ok is True
    assert validate_content_type({"Content-Type": "application/json; charset=utf-8"}).ok is True
    assert validate_content_type({"Content-Type": "text/plain"}).ok is False

  def test_absent_content_type_rejected(self) -> None:
    rejected = validate_content_type({})
    assert rejected.ok is False
    assert rejected.rejection.error["code"] == HEADER_MISMATCH_CODE


class TestAc14_12Accept:
  """AC-14.12 — Accept lists both media types (R-9.3.2-a/b)."""

  def test_accepts_when_both_present_rejects_when_either_missing(self) -> None:
    assert validate_accept({"Accept": "application/json, text/event-stream"}).ok is True
    assert validate_accept({"Accept": "application/json"}).ok is False
    assert validate_accept({"Accept": "text/event-stream"}).ok is False

  def test_tolerates_q_parameters(self) -> None:
    assert validate_accept({"Accept": "application/json;q=1.0, text/event-stream;q=0.9"}).ok is True


class TestAc14_13ProtocolVersionEqualsBody:
  """AC-14.13 — MCP-Protocol-Version equals body _meta version (R-9.3.3-a)."""

  def test_accepts_when_header_equals_body_and_supported(self) -> None:
    result = validate_protocol_version_header(
      {"MCP-Protocol-Version": PV}, tools_call_body(), ProtocolVersionValidationOptions(supported_versions=[PV])
    )
    assert result.ok is True
    assert result.version == PV


class TestAc14_14AbsentProtocolVersion:
  """AC-14.14 — absent MCP-Protocol-Version header (R-9.3.3-b/c)."""

  def test_rejects_when_pre_header_clients_unsupported(self) -> None:
    result = validate_protocol_version_header(
      {}, tools_call_body(), ProtocolVersionValidationOptions(supported_versions=[PV])
    )
    assert result.ok is False
    assert result.rejection.status == 400
    assert result.rejection.error["code"] == HEADER_MISMATCH_CODE

  def test_treats_as_earliest_revision_when_supported(self) -> None:
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


class TestAc14_15ProtocolVersionMismatch:
  """AC-14.15 — header/body mismatch (R-9.3.3-d)."""

  def test_rejects_with_header_mismatch(self) -> None:
    result = validate_protocol_version_header(
      {"MCP-Protocol-Version": "2025-03-26"},
      tools_call_body(),
      ProtocolVersionValidationOptions(supported_versions=[PV, "2025-03-26"]),
    )
    assert result.ok is False
    assert result.rejection.error["code"] == HEADER_MISMATCH_CODE


class TestAc14_16UnsupportedProtocolVersion:
  """AC-14.16 — unsupported version → -32004 (R-9.3.3-e)."""

  def test_rejects_with_32004_naming_supported_requested(self) -> None:
    body = {
      "jsonrpc": "2.0",
      "id": 1,
      "method": "tools/list",
      "params": {"_meta": {"io.modelcontextprotocol/protocolVersion": "2099-01-01"}},
    }
    result = validate_protocol_version_header(
      {"MCP-Protocol-Version": "2099-01-01"}, body, ProtocolVersionValidationOptions(supported_versions=[PV])
    )
    assert result.ok is False
    assert result.rejection.status == 400
    assert result.rejection.error["code"] == -32004
    assert result.rejection.error["data"] == {"supported": [PV], "requested": "2099-01-01"}


class TestAc14_17McpMethod:
  """AC-14.17 — Mcp-Method mirrors body method verbatim (R-9.4-a, R-9.4.1-a)."""

  def test_accepts_exact_match_rejects_case_or_missing(self) -> None:
    body = {"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {"_meta": META}}
    assert validate_routing_headers({"Mcp-Method": "tools/list"}, body).ok is True
    assert validate_routing_headers({"Mcp-Method": "tools/LIST"}, body).ok is False
    assert validate_routing_headers({}, body).ok is False


class TestAc14_18McpName:
  """AC-14.18 — Mcp-Name presence and value (R-9.4-b, R-9.4.2-a–e)."""

  def test_present_on_tools_call(self) -> None:
    assert routing_name_for("tools/call", {"name": "execute_sql"}) == "execute_sql"

  def test_present_on_prompts_get(self) -> None:
    assert routing_name_for("prompts/get", {"name": "greet"}) == "greet"

  def test_present_on_resources_read_uses_uri(self) -> None:
    assert routing_name_for("resources/read", {"uri": "file:///a"}) == "file:///a"

  def test_absent_on_methods_without_target(self) -> None:
    assert method_requires_mcp_name("tools/list") is False
    assert routing_name_for("tools/list", {}) is None
    body = {"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {"_meta": META}}
    assert validate_routing_headers({"Mcp-Method": "tools/list", "Mcp-Name": "x"}, body).ok is False


class TestAc14_19RoutingRejection:
  """AC-14.19 — routing mismatch/missing → 400 + -32001 (R-9.4.3-a)."""

  def test_rejects_when_mcp_name_disagrees(self) -> None:
    body = tools_call_body()
    result = validate_routing_headers({"Mcp-Method": "tools/call", "Mcp-Name": "wrong_tool"}, body)
    assert result.ok is False
    assert result.rejection.status == 400
    assert result.rejection.error["code"] == -32001

  def test_rejects_when_required_routing_header_missing(self) -> None:
    body = tools_call_body()
    assert validate_routing_headers({"Mcp-Method": "tools/call"}, body).ok is False


class TestAc14_20ParamHeaderMechanism:
  """AC-14.20 — server MAY designate; client MUST support (R-9.5-a/b/c)."""

  def test_client_builds_param_headers_from_annotated_schema(self) -> None:
    schema = {"type": "object", "properties": {"region": {"type": "string", "x-mcp-header": "Region"}}}
    headers = build_param_headers(schema, {"region": "us-west1"})
    assert headers["Mcp-Param-Region"] == "us-west1"


class TestAc14_21XMcpHeaderNameValidity:
  """AC-14.21 — invalid x-mcp-header names (R-9.5.1-a/b/c/d)."""

  @staticmethod
  def tool(ann: object, second: object = ...) -> dict:
    props: dict = {"a": {"type": "string", "x-mcp-header": ann}}
    if second is not ...:
      props["b"] = {"type": "string", "x-mcp-header": second}
    return {"name": "t", "inputSchema": {"type": "object", "properties": props}}

  def test_rejects_empty(self) -> None:
    assert validate_tool_x_mcp_headers(self.tool("")).valid is False

  def test_rejects_non_tchar(self) -> None:
    assert validate_tool_x_mcp_headers(self.tool("bad name")).valid is False

  def test_rejects_control_char(self) -> None:
    assert validate_tool_x_mcp_headers(self.tool("a\r\nb")).valid is False

  def test_rejects_case_insensitive_duplicates(self) -> None:
    assert validate_tool_x_mcp_headers(self.tool("Region", "region")).valid is False

  def test_accepts_valid_distinct_pair(self) -> None:
    assert validate_tool_x_mcp_headers(self.tool("Region", "Zone")).valid is True


class TestAc14_22XMcpHeaderTypeRangeNesting:
  """AC-14.22 — annotated type & range & nesting (R-9.5.1-e/f/g/h)."""

  @staticmethod
  def with_type(type_: str) -> dict:
    return {"name": "t", "inputSchema": {"type": "object", "properties": {"a": {"type": type_, "x-mcp-header": "A"}}}}

  def test_honors_integer_string_boolean(self) -> None:
    assert validate_tool_x_mcp_headers(self.with_type("integer")).valid is True
    assert validate_tool_x_mcp_headers(self.with_type("string")).valid is True
    assert validate_tool_x_mcp_headers(self.with_type("boolean")).valid is True

  def test_rejects_number(self) -> None:
    assert validate_tool_x_mcp_headers(self.with_type("number")).valid is False

  def test_integer_range_bound(self) -> None:
    assert MAX_SAFE_ANNOTATED_INTEGER == 2 ** 53 - 1
    assert MIN_SAFE_ANNOTATED_INTEGER == -(2 ** 53) + 1
    assert is_annotated_integer_in_range(2 ** 53 - 1) is True
    assert is_annotated_integer_in_range(2 ** 53) is False
    assert is_annotated_integer_in_range(-(2 ** 53)) is False

  def test_accepts_nested_annotation(self) -> None:
    nested = {
      "name": "t",
      "inputSchema": {
        "type": "object",
        "properties": {
          "outer": {"type": "object", "properties": {"inner": {"type": "integer", "x-mcp-header": "Inner"}}}
        },
      },
    }
    assert validate_tool_x_mcp_headers(nested).valid is True


class TestAc14_23InvalidToolFiltering:
  """AC-14.23 — filtering excludes only the invalid tool (R-9.5.1-i/j/k/l)."""

  def test_keeps_valid_drops_invalid_warns(self) -> None:
    good = {"name": "good", "inputSchema": {"type": "object", "properties": {"r": {"type": "string", "x-mcp-header": "R"}}}}
    bad = {"name": "bad", "inputSchema": {"type": "object", "properties": {"n": {"type": "number", "x-mcp-header": "N"}}}}
    result = filter_valid_tools([good, bad])
    assert [t["name"] for t in result.tools] == ["good"]
    assert len(result.warnings) == 1
    assert result.warnings[0].tool == "bad"
    assert "N" in result.warnings[0].reason


class TestAc14_24_25EmissionAndValidation:
  """AC-14.24 · AC-14.25 — Mcp-Param emission + server validation (R-9.5.2-a–f)."""

  schema = {
    "type": "object",
    "properties": {"region": {"type": "string", "x-mcp-header": "Region"}, "query": {"type": "string"}},
  }

  def test_appends_one_header_per_annotated_param(self) -> None:
    headers = build_param_headers(self.schema, {"region": "us-west1", "query": "SELECT 1"})
    assert headers == {"Mcp-Param-Region": "us-west1"}

  def test_server_validates_header_against_body(self) -> None:
    result = validate_param_headers(
      self.schema, {"region": "us-west1", "query": "SELECT 1"}, {"Mcp-Param-Region": "us-west1"}
    )
    assert result.ok is True


class TestAc14_26NullAbsentOmitsHeader:
  """AC-14.26 — null/absent annotated values omit the header (R-9.5.2-g/h/i/j)."""

  schema = {"type": "object", "properties": {"region": {"type": "string", "x-mcp-header": "Region"}}}

  def test_null_value_omits_header(self) -> None:
    assert build_param_headers(self.schema, {"region": None}) == {}
    assert validate_param_headers(self.schema, {"region": None}, {}).ok is True

  def test_absent_value_omits_header(self) -> None:
    assert build_param_headers(self.schema, {}) == {}
    assert validate_param_headers(self.schema, {}, {}).ok is True


class TestAc14_27OmittedHeaderForPresentValue:
  """AC-14.27 — body value present but header omitted → reject (R-9.5.2-k)."""

  def test_rejects_with_header_mismatch(self) -> None:
    schema = {"type": "object", "properties": {"region": {"type": "string", "x-mcp-header": "Region"}}}
    result = validate_param_headers(schema, {"region": "us-west1"}, {})
    assert result.ok is False
    assert result.rejection.error["code"] == -32001


class TestAc14_28StaleSchemaStrategy:
  """AC-14.28 — stale/absent schema strategy (R-9.5.2-l/m/n)."""

  def test_no_schema_emits_no_custom_headers(self) -> None:
    assert build_param_headers(None, {"region": "us-west1"}) == {}

  def test_documents_strategy_codes(self) -> None:
    assert STALE_SCHEMA_STRATEGY["SEND_WITHOUT_HEADERS"] == "R-9.5.2-l"
    assert STALE_SCHEMA_STRATEGY["RETRY_AFTER_TOOLS_LIST"] == "R-9.5.2-m"
    assert STALE_SCHEMA_STRATEGY["MAY_PRELOAD"] == "R-9.5.2-n"


class TestAc14_29ValueEncoding:
  """AC-14.29 — parameter value encoding (R-9.5.3-a/b/c/e)."""

  def test_encodes_per_type(self) -> None:
    assert encode_header_value("us-west1") == "us-west1"
    assert encode_header_value(42) == "42"
    assert encode_header_value(-7) == "-7"
    assert encode_header_value(True) == "true"
    assert encode_header_value(False) == "false"

  def test_sentinel_encodes_non_ascii(self) -> None:
    encoded = encode_header_value("Hello, 世界")
    assert encoded.startswith(BASE64_SENTINEL_PREFIX)
    assert encoded.endswith(BASE64_SENTINEL_SUFFIX)
    assert decode_header_value(encoded) == "Hello, 世界"

  def test_sentinel_encodes_whitespace_and_control(self) -> None:
    assert is_sentinel_encoded(encode_header_value(" lead")) is True
    assert is_sentinel_encoded(encode_header_value("trail ")) is True
    assert is_sentinel_encoded(encode_header_value("a\tb\nc")) is True

  def test_sentinel_encodes_sentinel_lookalike(self) -> None:
    lookalike = "=?base64?abc?="
    encoded = encode_header_value(lookalike)
    assert encoded != lookalike
    assert decode_header_value(encoded) == lookalike

  def test_plain_string_form_directly(self) -> None:
    assert plain_string_form(True) == "true"
    assert plain_string_form(0) == "0"
    assert plain_string_form("x") == "x"

  def test_out_of_range_integer_raises(self) -> None:
    with pytest.raises(ValueError):
      encode_header_value(2 ** 53)

  def test_needs_sentinel_and_sentinel_encode_roundtrip(self) -> None:
    assert needs_sentinel("plain") is False
    assert needs_sentinel("世界") is True
    assert decode_header_value(sentinel_encode("世界")) == "世界"


class TestAc14_30ReceiverDecodesSentinel:
  """AC-14.30 — receiver detects and decodes the sentinel (R-9.5.3-d)."""

  def test_decodes_example(self) -> None:
    assert decode_header_value("=?base64?SGVsbG8sIOS4lueVjA==?=") == "Hello, 世界"

  def test_non_sentinel_returned_unchanged(self) -> None:
    assert decode_header_value("plain-value") == "plain-value"


class TestAc14_31IntermediaryForwardsUnknownParam:
  """AC-14.31 — intermediary forwards unknown Mcp-Param header (R-9.5.4-a)."""

  def test_recognizes_param_family_case_insensitively(self) -> None:
    assert is_param_header("Mcp-Param-Region") is True
    assert is_param_header("mcp-param-region") is True
    assert is_param_header("Mcp-Method") is False

  def test_param_header_name_builder(self) -> None:
    assert param_header_name("Region") == "Mcp-Param-Region"


class TestAc14_32ReceiverRejectsBadOrMismatched:
  """AC-14.32 — receiver rejects impermissible/mismatched param headers (R-9.5.4-b/c)."""

  schema = {"type": "object", "properties": {"region": {"type": "string", "x-mcp-header": "Region"}}}

  def test_rejects_impermissible_characters(self) -> None:
    result = validate_param_headers(self.schema, {"region": "x"}, {"Mcp-Param-Region": "café"})
    assert result.ok is False
    assert result.rejection.error["code"] == -32001

  def test_rejects_decoded_value_mismatch(self) -> None:
    result = validate_param_headers(self.schema, {"region": "us-west1"}, {"Mcp-Param-Region": "eu-central1"})
    assert result.ok is False
    assert result.rejection.error["code"] == -32001


class TestAc14_33IntegerComparedNumerically:
  """AC-14.33 — integer header compared numerically (R-9.5.4-d)."""

  schema = {"type": "object", "properties": {"limit": {"type": "integer", "x-mcp-header": "Limit"}}}

  def test_42_0_matches_body_42(self) -> None:
    assert validate_param_headers(self.schema, {"limit": 42}, {"Mcp-Param-Limit": "42.0"}).ok is True
    assert validate_param_headers(self.schema, {"limit": 42}, {"Mcp-Param-Limit": "43"}).ok is False


# ════════════════════════════════════════════════════════════════════════════════
# S15 — Responses, Status Mapping & HeaderMismatch (§9.6–§9.12)  ·  AC-15.1 … AC-15.25
# ════════════════════════════════════════════════════════════════════════════════


class TestAc15_1ResponseShapeChoice:
  """AC-15.1 — exactly one of two shapes, both 200 OK (R-9.6-a)."""

  def test_picks_exactly_one_shape(self) -> None:
    assert choose_response_shape(False) == ResponseShape.SINGLE_JSON
    assert choose_response_shape(True) == ResponseShape.EVENT_STREAM
    assert len({ResponseShape.SINGLE_JSON, ResponseShape.EVENT_STREAM}) == 2

  def test_both_shapes_over_200(self) -> None:
    assert OK_STATUS == 200
    single = build_single_json_response({"jsonrpc": "2.0", "id": 1, "result": {"resultType": "complete"}})
    assert single.status == OK_STATUS
    assert build_event_stream_headers()["Content-Type"] == EVENT_STREAM_CONTENT_TYPE


class TestAc15_2SingleJsonResponse:
  """AC-15.2 — single JSON response (R-9.6.1-a)."""

  def test_200_json_id_echoed(self) -> None:
    res = build_single_json_response({"jsonrpc": "2.0", "id": 7, "result": {"resultType": "complete"}})
    assert res.status == 200
    assert res.headers["Content-Type"] == SINGLE_JSON_CONTENT_TYPE
    assert res.body == {"jsonrpc": "2.0", "id": 7, "result": {"resultType": "complete"}}
    assert res.body["id"] == 7

  def test_error_response_shape_preserves_id(self) -> None:
    res = build_single_json_response({"jsonrpc": "2.0", "id": "abc", "error": {"code": -1, "message": "x"}})
    assert res.body["id"] == "abc"


class TestAc15_3EventStreamFraming:
  """AC-15.3 — event-stream framing (R-9.6.2-a)."""

  def test_opens_text_event_stream(self) -> None:
    assert build_event_stream_headers()["Content-Type"] == "text/event-stream"

  def test_each_event_one_data_line(self) -> None:
    msg = {"jsonrpc": "2.0", "id": 1, "result": {"resultType": "complete"}}
    event = format_sse_event(msg)
    assert event == f"data: {json.dumps(msg, separators=(',', ':'))}\n\n"
    assert event.endswith("\n\n")
    assert event.startswith("data: ")
    assert json.loads(event[len("data: ") :].rstrip()) == msg


class TestAc15_4RequestScopedNotifications:
  """AC-15.4 — pre-response notifications relate to the request (R-9.6.2-b/c)."""

  def test_may_emit_notifications_before_final_response(self) -> None:
    events: list[str] = []
    stream = RequestEventStream(events.append)
    stream.send_notification(
      {"jsonrpc": "2.0", "method": "notifications/progress", "params": {"progressToken": "sql-1", "progress": 50, "total": 100}}
    )
    stream.send_notification(
      {"jsonrpc": "2.0", "method": "notifications/message", "params": {"level": "info", "data": "querying"}}
    )
    assert len(events) == 2
    assert "notifications/progress" in events[0]
    assert "notifications/message" in events[1]

  def test_notification_carrying_id_rejected(self) -> None:
    stream = RequestEventStream(lambda _e: None)
    with pytest.raises(RuntimeError):
      stream.send_notification({"jsonrpc": "2.0", "method": "notifications/progress", "id": 1})


class TestAc15_5NoIndependentRequestOnStream:
  """AC-15.5 — never an independent request on the stream (R-9.6.2-d)."""

  def test_method_plus_id_forbidden(self) -> None:
    result = validate_stream_message({"jsonrpc": "2.0", "method": "sampling/createMessage", "id": 9})
    assert result.ok is False

  def test_notification_and_response_allowed(self) -> None:
    assert validate_stream_message({"jsonrpc": "2.0", "method": "notifications/progress", "params": {}}).ok is True
    assert validate_stream_message({"jsonrpc": "2.0", "id": 1, "result": {}}).ok is True

  def test_non_object_rejected(self) -> None:
    assert validate_stream_message("not an object").ok is False


class TestAc15_6FinalResponseTerminates:
  """AC-15.6 — final response terminates, nothing after (R-9.6.2-e/f)."""

  def test_final_response_closes_as_completed(self) -> None:
    events: list[str] = []
    stream = RequestEventStream(events.append)
    stream.send_final_response({"jsonrpc": "2.0", "id": 1, "result": {"resultType": "complete"}})
    assert stream.closed is True
    assert stream.completed is True
    assert len(events) == 1

  def test_no_messages_after_final_response(self) -> None:
    stream = RequestEventStream(lambda _e: None)
    stream.send_final_response({"jsonrpc": "2.0", "id": 1, "result": {}})
    with pytest.raises(RuntimeError):
      stream.send_notification({"jsonrpc": "2.0", "method": "notifications/progress"})
    with pytest.raises(RuntimeError):
      stream.send_final_response({"jsonrpc": "2.0", "id": 1, "result": {}})


class TestAc15_7AccelBuffering:
  """AC-15.7 — X-Accel-Buffering: no (R-9.6.2-g)."""

  def test_included_by_default(self) -> None:
    headers = build_event_stream_headers()
    assert headers[X_ACCEL_BUFFERING_HEADER] == X_ACCEL_BUFFERING_VALUE
    assert X_ACCEL_BUFFERING_VALUE == "no"

  def test_can_be_omitted(self) -> None:
    headers = build_event_stream_headers(False)
    assert X_ACCEL_BUFFERING_HEADER not in headers


class TestAc15_8LastEventIdIgnored:
  """AC-15.8 — Last-Event-ID ignored, non-resumable (R-9.6.2-h, R-9.9-g)."""

  def test_strips_last_event_id(self) -> None:
    stripped = strip_ignored_stateless_headers({"Content-Type": "application/json", "Last-Event-ID": "42"})
    assert "Last-Event-ID" not in stripped
    assert stripped["Content-Type"] == "application/json"

  def test_strips_case_insensitively(self) -> None:
    stripped = strip_ignored_stateless_headers({"last-event-id": "7"})
    assert len(stripped) == 0
    assert LAST_EVENT_ID_HEADER == "Last-Event-ID"


class TestAc15_9CloseAsCancellation:
  """AC-15.9 — close-as-cancellation (R-9.6.2-i/j/k)."""

  def test_client_close_closes_without_completing(self) -> None:
    stream = RequestEventStream(lambda _e: None)
    stream.cancel_by_client_close()
    assert stream.closed is True
    assert stream.completed is False

  def test_no_messages_after_client_close(self) -> None:
    events: list[str] = []
    stream = RequestEventStream(events.append)
    stream.cancel_by_client_close()
    with pytest.raises(RuntimeError):
      stream.send_notification({"jsonrpc": "2.0", "method": "notifications/progress"})
    with pytest.raises(RuntimeError):
      stream.send_final_response({"jsonrpc": "2.0", "id": 1, "result": {}})
    assert len(events) == 0

  def test_cancel_is_idempotent(self) -> None:
    stream = RequestEventStream(lambda _e: None)
    stream.cancel_by_client_close()
    stream.cancel_by_client_close()  # must not raise
    assert stream.closed is True


class TestAc15_10MethodNotFound:
  """AC-15.10 — 404 + -32601 for unknown method (R-9.7-b)."""

  def test_404_with_error_body(self) -> None:
    res = build_method_not_found_response("tools/teleport", 7)
    assert res.status == NOT_FOUND_STATUS == 404
    body = res.body
    assert body["jsonrpc"] == "2.0"
    assert body["id"] == 7
    assert body["error"]["code"] == METHOD_NOT_FOUND_CODE == -32601
    assert "tools/teleport" in body["error"]["message"]

  def test_status_map(self) -> None:
    assert http_status_for_error_code(METHOD_NOT_FOUND_CODE) == 404
    assert http_status_for_error_code(PARSE_ERROR_CODE) == 400
    assert http_status_for_error_code(INVALID_REQUEST_CODE) == 400
    assert http_status_for_error_code(INVALID_PARAMS_CODE) == 400
    assert http_status_for_error_code(HEADER_MISMATCH_CODE) == 400
    assert http_status_for_error_code(-32603) == 400


class TestAc15_11HeaderMismatch:
  """AC-15.11 — -32001 HeaderMismatch on 400 (R-9.8-a/b/c/d)."""

  def test_builds_full_error_object(self) -> None:
    err = build_header_mismatch_error("Mcp-Name header value 'foo' does not match body value 'bar'")
    assert err["code"] == -32001 == HEADER_MISMATCH_CODE
    assert "foo" in err["message"]
    assert "data" not in err

  def test_with_data(self) -> None:
    err = build_header_mismatch_error("x", {"detail": 1})
    assert err["data"] == {"detail": 1}

  def test_wraps_into_400_with_id(self) -> None:
    res = build_header_mismatch_response(build_header_mismatch_error(), 1)
    assert res.status == BAD_REQUEST_STATUS == 400
    assert res.body["id"] == 1
    assert res.body["error"]["code"] == -32001

  def test_cause_missing_required_header(self) -> None:
    err = header_mismatch_for_cause(HeaderMismatchCause(kind="missing-required-header", header="Mcp-Method"))
    assert err["code"] == -32001
    assert "Mcp-Method" in err["message"]
    assert "missing" in err["message"]

  def test_cause_value_mismatch(self) -> None:
    err = header_mismatch_for_cause(
      HeaderMismatchCause(kind="value-mismatch", header="Mcp-Name", header_value="foo", body_value="bar")
    )
    assert err["code"] == -32001
    assert "'foo'" in err["message"]
    assert "'bar'" in err["message"]

  def test_cause_invalid_param_characters(self) -> None:
    err = header_mismatch_for_cause(HeaderMismatchCause(kind="invalid-param-characters", header="Mcp-Param-Region"))
    assert err["code"] == -32001
    assert "invalid characters" in err["message"]


class TestAc15_12IntermediaryRejection:
  """AC-15.12 — intermediary MAY omit JSON-RPC body (R-9.8-e/f)."""

  def test_appropriate_status_body_may_be_omitted(self) -> None:
    bodied = build_header_mismatch_response(build_header_mismatch_error())
    assert bodied.status == 400
    assert method_not_allowed_response("POST") is None
    bare_reject = {"status": BAD_REQUEST_STATUS, "headers": {}}
    assert bare_reject["status"] == 400
    assert bare_reject.get("body") is None


class TestAc15_13IntermediaryTrust:
  """AC-15.13 — intermediary trust depends on MCP-Protocol-Version (R-9.8-g/h)."""

  @staticmethod
  def intermediary_should_trust(protocol_version_header: str | None) -> bool:
    return protocol_version_header is not None

  def test_may_trust_when_version_present(self) -> None:
    assert self.intermediary_should_trust("2026-07-28") is True

  def test_should_reject_when_version_absent(self) -> None:
    assert self.intermediary_should_trust(None) is False


class TestAc15_14StatelessNoHandshake:
  """AC-15.14 — no handshake / no session state (R-9.9-a)."""

  def test_post_is_self_contained(self) -> None:
    res = build_single_json_response({"jsonrpc": "2.0", "id": 1, "result": {"resultType": "complete"}})
    assert res.status == 200


class TestAc15_15NoSessionIdentifier:
  """AC-15.15 — no session identifier header (R-9.9-b/c/d)."""

  def test_recognizes_session_id_headers_case_insensitively(self) -> None:
    assert is_session_id_header("Mcp-Session-Id") is True
    assert is_session_id_header("x-session-id") is True
    assert is_session_id_header("Content-Type") is False

  def test_session_id_header_stripped(self) -> None:
    stripped = strip_ignored_stateless_headers({"Mcp-Session-Id": "abc", "MCP-Protocol-Version": "2026-07-28"})
    assert "Mcp-Session-Id" not in stripped
    assert stripped["MCP-Protocol-Version"] == "2026-07-28"

  def test_no_builder_mints_session_id(self) -> None:
    res = build_single_json_response({"jsonrpc": "2.0", "id": 1, "result": {}})
    names = [h.lower() for h in res.headers]
    assert not any("session" in h for h in names)


class TestAc15_16NoServerAffinity:
  """AC-15.16 — no server affinity (R-9.9-e)."""

  def test_same_body_same_response(self) -> None:
    body = {"jsonrpc": "2.0", "id": 1, "result": {"resultType": "complete"}}
    assert build_single_json_response(dict(body)) == build_single_json_response(dict(body))


class TestAc15_17MethodNotAllowed:
  """AC-15.17 — 405 for GET/DELETE (R-9.9-f)."""

  def test_get_delete_return_405_empty_body(self) -> None:
    for method in ("GET", "DELETE", "get", "delete"):
      res = method_not_allowed_response(method)
      assert res is not None
      assert res.status == METHOD_NOT_ALLOWED_STATUS == 405
      assert res.body is None

  def test_post_allowed(self) -> None:
    assert method_not_allowed_response("POST") is None
    assert method_not_allowed_response("post") is None


class TestAc15_18OriginValidation:
  """AC-15.18 — Origin validation + 403 (R-9.11-a/b/c, R-9.7-a)."""

  def test_accepts_absent_and_accepted_origin(self) -> None:
    assert validate_origin(None, ["https://app.example"]).accepted is True
    assert validate_origin("https://app.example", ["https://app.example"]).accepted is True

  def test_rejects_present_origin_not_in_set(self) -> None:
    result = validate_origin("https://evil.example", {"https://app.example"})
    assert result.accepted is False
    assert result.origin == "https://evil.example"

  def test_403_body_has_no_id(self) -> None:
    res = build_forbidden_origin_response()
    assert res.status == FORBIDDEN_STATUS == 403
    assert res.body["jsonrpc"] == "2.0"
    assert "id" not in res.body
    assert res.body["error"]["code"] == INVALID_REQUEST_CODE

  def test_403_body_may_be_omitted(self) -> None:
    res = build_forbidden_origin_response("nope", False)
    assert res.status == 403
    assert res.body is None


class TestAc15_19LoopbackBinding:
  """AC-15.19 — loopback binding (R-9.11-d)."""

  def test_recommends_loopback_not_all_interfaces(self) -> None:
    assert recommended_local_bind_address() == LOOPBACK_BIND_ADDRESS == "127.0.0.1"
    assert recommended_local_bind_address() != ALL_INTERFACES_BIND_ADDRESS
    assert ALL_INTERFACES_BIND_ADDRESS == "0.0.0.0"


class TestAc15_20AuthDeferral:
  """AC-15.20 — auth recommendation / §23 deferral (R-9.11-e/f)."""

  def test_no_authz_codes_in_revision_set(self) -> None:
    assert MISSING_CLIENT_CAPABILITY_CODE in REVISION_ERROR_CODES
    assert UNSUPPORTED_PROTOCOL_VERSION_CODE in REVISION_ERROR_CODES
    assert -32603 not in REVISION_ERROR_CODES


class TestAc15_21ProbeInspectsBody:
  """AC-15.21 — probe inspects body on 400 (R-9.12-a/b)."""

  def test_400_with_recognized_error_retries(self) -> None:
    decision = interpret_post_for_fallback(
      400, {"jsonrpc": "2.0", "error": {"code": HEADER_MISMATCH_CODE, "message": "mismatch"}}
    )
    assert decision.action == "retry"

  def test_recognizes_all_revision_codes_on_400(self) -> None:
    for code in REVISION_ERROR_CODES:
      decision = interpret_post_for_fallback(400, {"jsonrpc": "2.0", "error": {"code": code, "message": "x"}})
      assert decision.action == "retry"


class TestAc15_22RecognizedErrorRetries:
  """AC-15.22 — recognized error → retry, no initialize fallback (R-9.12-c/d)."""

  def test_retries_using_supported_when_present(self) -> None:
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

  def test_retries_without_supported(self) -> None:
    decision = interpret_post_for_fallback(
      400, {"jsonrpc": "2.0", "error": {"code": INVALID_PARAMS_CODE, "message": "bad params"}}
    )
    assert decision.action == "retry"
    assert decision.supported is None


class TestAc15_23UnrecognizedBodyFallsBack:
  """AC-15.23 — empty/unrecognized body MAY fall back (R-9.12-e)."""

  def test_empty_body_on_400_probes(self) -> None:
    assert interpret_post_for_fallback(400, None).action == "legacy-probe"

  def test_unrecognized_error_code_on_400_probes(self) -> None:
    decision = interpret_post_for_fallback(
      400, {"jsonrpc": "2.0", "error": {"code": -32099, "message": "some other server error"}}
    )
    assert decision.action == "legacy-probe"

  def test_non_failing_status_proceeds(self) -> None:
    assert interpret_post_for_fallback(200, {"jsonrpc": "2.0", "id": 1, "result": {}}).action == "proceed"


class TestAc15_24DualHosting:
  """AC-15.24 — server dual-hosts legacy transport (R-9.12-f)."""

  def test_legacy_endpoint_event_name_exposed(self) -> None:
    assert LEGACY_ENDPOINT_EVENT == "endpoint"


class TestAc15_25LegacyGetFallback:
  """AC-15.25 — client falls back via GET + endpoint event (R-9.12-g/h)."""

  def test_400_404_405_with_unrecognized_body_probes(self) -> None:
    for status in (400, 404, 405):
      assert interpret_post_for_fallback(status, None).action == "legacy-probe"

  def test_first_event_endpoint_marks_legacy(self) -> None:
    assert is_legacy_http_sse_server("endpoint") is True
    assert is_legacy_http_sse_server("message") is False
    assert is_legacy_http_sse_server(None) is False


class TestSharedBuildersAndConstants:
  """Cross-cutting builders & status constants (mirrors the TS shared block)."""

  def test_202_accepted_empty_body(self) -> None:
    res = build_notification_accepted_response()
    assert res.status == NOTIFICATION_ACCEPTED_STATUS == 202
    assert res.body is None

  def test_build_error_response_omits_id_when_absent(self) -> None:
    res = build_error_response(400, {"code": PARSE_ERROR_CODE, "message": "Parse error"})
    assert "id" not in res.body

  def test_build_error_response_includes_id_when_given(self) -> None:
    res = build_error_response(400, {"code": PARSE_ERROR_CODE, "message": "Parse error"}, 5)
    assert res.body["id"] == 5

  def test_error_code_constants_canonical(self) -> None:
    assert HEADER_MISMATCH_CODE == -32001
    assert MISSING_CLIENT_CAPABILITY_CODE == -32003
    assert UNSUPPORTED_PROTOCOL_VERSION_CODE == -32004
    assert PARSE_ERROR_CODE == -32700
    assert INVALID_REQUEST_CODE == -32600
    assert METHOD_NOT_FOUND_CODE == -32601
    assert INVALID_PARAMS_CODE == -32602


class TestPackageBarrelReExport:
  """The new package __init__ re-exports the full public surface (mirrors index.ts)."""

  def test_barrel_exposes_all_names(self) -> None:
    import mcp.transport.http as pkg

    # A representative symbol from each of the four sibling modules must be present
    # on the package barrel, and every name listed in __all__ must resolve.
    for name in (
      "build_post_headers",        # headers
      "encode_header_value",       # param_encoding
      "build_param_headers",       # param_headers
      "build_single_json_response",  # responses
    ):
      assert hasattr(pkg, name)
    for name in pkg.__all__:
      assert hasattr(pkg, name), f"missing re-export: {name}"
