"""Tests for discovery via server/discover (§5.3)."""

import pytest

from mcp.protocol.errors import INVALID_PARAMS_CODE, UNSUPPORTED_PROTOCOL_VERSION_CODE
from mcp.protocol.discovery import (
  SERVER_DISCOVER_METHOD,
  DiscoverConfig,
  build_discover_request,
  build_discover_response,
  build_discover_result,
  build_unsupported_protocol_version_error,
  is_discover_result,
  is_version_supported,
  process_discover_request,
  resolve_instructions,
  select_revision,
  validate_discover_request,
)
from mcp.protocol.meta import (
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  PROTOCOL_VERSION_META_KEY,
)

SERVER_INFO = {"name": "srv", "version": "1.0"}
CLIENT_INFO = {"name": "cli", "version": "0.1"}


def config(versions=("2026-07-28",), **kw) -> DiscoverConfig:
  return DiscoverConfig(supported_versions=list(versions), capabilities={}, server_info=SERVER_INFO, **kw)


def discover_request(version="2026-07-28") -> dict:
  return build_discover_request(1, version, CLIENT_INFO, {})


class TestVersionSupport:
  def test_membership_order_independent(self):
    assert is_version_supported(["a", "2026-07-28"], "2026-07-28")
    assert not is_version_supported(["a"], "2026-07-28")


class TestBuildResult:
  def test_complete_minimal(self):
    result = build_discover_result(config())
    assert result["resultType"] == "complete"
    assert result["supportedVersions"] == ["2026-07-28"]
    assert result["serverInfo"] == SERVER_INFO
    assert "instructions" not in result and "_meta" not in result

  def test_optional_fields_only_when_given(self):
    result = build_discover_result(config(instructions="use me", meta={"x": 1}))
    assert result["instructions"] == "use me"
    assert result["_meta"] == {"x": 1}

  def test_empty_versions_raises(self):
    with pytest.raises(ValueError):
      build_discover_result(config(versions=()))


class TestIsDiscoverResult:
  def test_valid(self):
    assert is_discover_result(build_discover_result(config()))

  def test_invalid(self):
    assert not is_discover_result({"resultType": "complete", "supportedVersions": [], "capabilities": {}, "serverInfo": SERVER_INFO})
    assert not is_discover_result({"resultType": "complete", "supportedVersions": ["x"], "capabilities": {}, "serverInfo": {"name": "n"}})
    assert not is_discover_result("nope")


class TestValidateRequest:
  def test_valid_returns_version(self):
    v = validate_discover_request(discover_request("2026-07-28"))
    assert v.ok and v.requested_version == "2026-07-28"

  def test_wrong_method(self):
    req = discover_request()
    req["method"] = "tools/list"
    v = validate_discover_request(req)
    assert not v.ok and v.code == INVALID_PARAMS_CODE

  def test_missing_params(self):
    v = validate_discover_request({"method": SERVER_DISCOVER_METHOD})
    assert not v.ok and v.code == INVALID_PARAMS_CODE

  def test_missing_meta(self):
    v = validate_discover_request({"method": SERVER_DISCOVER_METHOD, "params": {}})
    assert not v.ok and v.code == INVALID_PARAMS_CODE

  def test_invalid_meta_keys(self):
    req = discover_request()
    del req["params"]["_meta"][CLIENT_INFO_META_KEY]
    v = validate_discover_request(req)
    assert not v.ok and v.code == INVALID_PARAMS_CODE


class TestProcess:
  def test_success(self):
    outcome = process_discover_request(config(), discover_request("2026-07-28"))
    assert outcome.ok and is_discover_result(outcome.result)

  def test_unsupported_version(self):
    outcome = process_discover_request(config(versions=("2026-07-28",)), discover_request("2025-01-01"))
    assert not outcome.ok
    assert outcome.error["code"] == UNSUPPORTED_PROTOCOL_VERSION_CODE
    assert outcome.error["data"]["requested"] == "2025-01-01"
    assert outcome.error["data"]["supported"] == ["2026-07-28"]

  def test_invalid_params(self):
    outcome = process_discover_request(config(), {"method": "wrong"})
    assert not outcome.ok and outcome.error["code"] == INVALID_PARAMS_CODE


class TestBuilders:
  def test_request_carries_reserved_keys(self):
    req = build_discover_request(7, "2026-07-28", CLIENT_INFO, {"sampling": {}}, extra_meta={"com.x/k": 1})
    meta = req["params"]["_meta"]
    assert req["id"] == 7 and req["method"] == SERVER_DISCOVER_METHOD
    assert meta[PROTOCOL_VERSION_META_KEY] == "2026-07-28"
    assert meta[CLIENT_INFO_META_KEY] == CLIENT_INFO
    assert meta[CLIENT_CAPABILITIES_META_KEY] == {"sampling": {}}
    assert meta["com.x/k"] == 1

  def test_reserved_keys_win_over_extra(self):
    req = build_discover_request(1, "2026-07-28", CLIENT_INFO, {}, extra_meta={PROTOCOL_VERSION_META_KEY: "hacked"})
    assert req["params"]["_meta"][PROTOCOL_VERSION_META_KEY] == "2026-07-28"

  def test_response_envelope(self):
    resp = build_discover_response(9, config())
    assert resp["jsonrpc"] == "2.0" and resp["id"] == 9
    assert is_discover_result(resp["result"])

  def test_unsupported_error_builder(self):
    err = build_unsupported_protocol_version_error("x", ["a", "b"])
    assert err["code"] == UNSUPPORTED_PROTOCOL_VERSION_CODE
    assert err["data"] == {"supported": ["a", "b"], "requested": "x"}


class TestClientSide:
  def test_select_revision_client_order_wins(self):
    # Server lists b first, but the client prefers a → a is chosen.
    assert select_revision(["b", "a"], ["a", "b"]) == "a"

  def test_select_revision_order_independent(self):
    assert select_revision(["a", "b"], ["b"]) == "b"
    assert select_revision(["b", "a"], ["b"]) == "b"

  def test_select_revision_no_overlap(self):
    assert select_revision(["a"], ["z"]) is None

  def test_select_revision_default_acceptable(self):
    assert select_revision(["2026-07-28"]) == "2026-07-28"

  def test_resolve_instructions(self):
    assert resolve_instructions({"instructions": "hi"}) == "hi"
    assert resolve_instructions({}) is None
    assert resolve_instructions({"instructions": 5}) is None
