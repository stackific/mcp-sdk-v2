"""Tests for discovery via server/discover (§5.3).

Mirrors the TS suite ts-sdk/src/__tests__/protocol/discovery.test.ts (AC-08.1 – AC-08.12)
case-for-case, adapting the Zod-schema assertions to the Python dict + validator
convention (``is_discover_result`` / ``validate_discover_request`` stand in for the
``DiscoverResultSchema`` / ``DiscoverRequestSchema`` ``safeParse`` checks), plus edge
cases. Every existing test is retained.
"""

import pytest

from mcp.protocol.errors import INVALID_PARAMS_CODE, UNSUPPORTED_PROTOCOL_VERSION_CODE
from mcp.protocol.discovery import (
  CURRENT_PROTOCOL_VERSION,
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

# The §5.3.3 wire-example identities, matching the TS suite's `config`/`validRequest`.
EXAMPLE_SERVER_INFO = {"name": "ExampleServer", "version": "2.3.1"}
EXAMPLE_CLIENT_INFO = {"name": "ExampleClient", "version": "1.0.0"}


def config(versions=("2026-07-28",), **kw) -> DiscoverConfig:
  return DiscoverConfig(supported_versions=list(versions), capabilities={}, server_info=SERVER_INFO, **kw)


def discover_request(version="2026-07-28") -> dict:
  return build_discover_request(1, version, CLIENT_INFO, {})


def valid_request(version=CURRENT_PROTOCOL_VERSION) -> dict:
  """A well-formed server/discover request matching the §5.3.3 wire example."""
  return {
    "jsonrpc": "2.0",
    "id": 1,
    "method": SERVER_DISCOVER_METHOD,
    "params": {
      "_meta": {
        PROTOCOL_VERSION_META_KEY: version,
        CLIENT_INFO_META_KEY: dict(EXAMPLE_CLIENT_INFO),
        CLIENT_CAPABILITIES_META_KEY: {},
      },
    },
  }


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


# ─── Method name (mirrors TS `SERVER_DISCOVER_METHOD`) ────────────────────────


class TestMethodName:
  def test_is_server_discover(self):
    assert SERVER_DISCOVER_METHOD == "server/discover"


# ─── AC-08.1 — server/discover is implemented (R-5.3-a) ───────────────────────


class TestServerDiscoverImplemented:
  def test_well_formed_request_returns_discover_result(self):
    outcome = process_discover_request(config(versions=(CURRENT_PROTOCOL_VERSION,)), valid_request())
    assert outcome.ok
    assert is_discover_result(outcome.result)

  def test_serverinfo_echoed_in_result(self):
    cfg = DiscoverConfig(
      supported_versions=[CURRENT_PROTOCOL_VERSION], capabilities={}, server_info=EXAMPLE_SERVER_INFO
    )
    outcome = process_discover_request(cfg, valid_request())
    assert outcome.ok
    assert outcome.result["serverInfo"] == EXAMPLE_SERVER_INFO

  def test_method_literal_enforced_by_validation(self):
    # Stand-in for TS's DiscoverRequestSchema.safeParse method-literal check.
    good = {
      "method": SERVER_DISCOVER_METHOD,
      "params": {
        "_meta": {
          PROTOCOL_VERSION_META_KEY: "2026-07-28",
          CLIENT_INFO_META_KEY: {"name": "c", "version": "1"},
          CLIENT_CAPABILITIES_META_KEY: {},
        }
      },
    }
    assert validate_discover_request(good).ok
    bad = {"method": "server/other", "params": {"_meta": {}}}
    assert not validate_discover_request(bad).ok

  def test_matches_5_3_3_success_wire_example(self):
    cfg = DiscoverConfig(
      supported_versions=["2026-07-28"],
      capabilities={"tools": {}, "resources": {}, "extensions": {"io.modelcontextprotocol/tasks": {}}},
      server_info=EXAMPLE_SERVER_INFO,
      instructions=(
        "This server exposes file-search and code-analysis tools. "
        "Prefer search before analysis for large repositories."
      ),
    )
    outcome = process_discover_request(cfg, valid_request())
    assert outcome.ok
    result = outcome.result
    assert result["resultType"] == "complete"
    assert result["supportedVersions"] == ["2026-07-28"]
    assert result["capabilities"] == {
      "tools": {},
      "resources": {},
      "extensions": {"io.modelcontextprotocol/tasks": {}},
    }
    assert result["serverInfo"] == EXAMPLE_SERVER_INFO


# ─── AC-08.2 — three reserved _meta keys REQUIRED (R-5.3.1-a – R-5.3.1-d) ──────


class TestReservedMetaKeys:
  def test_accepts_all_three_reserved_keys(self):
    result = validate_discover_request(valid_request())
    assert result.ok
    assert result.requested_version == CURRENT_PROTOCOL_VERSION

  def test_rejects_missing_protocol_version(self):
    req = valid_request()
    del req["params"]["_meta"][PROTOCOL_VERSION_META_KEY]
    result = validate_discover_request(req)
    assert not result.ok
    assert result.code == INVALID_PARAMS_CODE

  def test_rejects_missing_client_info(self):
    req = valid_request()
    del req["params"]["_meta"][CLIENT_INFO_META_KEY]
    assert not validate_discover_request(req).ok

  def test_rejects_client_info_without_version(self):
    req = valid_request()
    req["params"]["_meta"][CLIENT_INFO_META_KEY] = {"name": "c"}
    assert not validate_discover_request(req).ok

  def test_rejects_missing_client_capabilities(self):
    req = valid_request()
    del req["params"]["_meta"][CLIENT_CAPABILITIES_META_KEY]
    assert not validate_discover_request(req).ok

  def test_rejects_wrong_method(self):
    req = valid_request()
    req["method"] = "tools/list"
    assert not validate_discover_request(req).ok

  def test_rejects_absent_params(self):
    assert not validate_discover_request(
      {"jsonrpc": "2.0", "id": 1, "method": SERVER_DISCOVER_METHOD}
    ).ok

  def test_rejects_non_object_request(self):
    # Python analogue of TS's "request must be an object" guard.
    assert not validate_discover_request(None).ok
    assert not validate_discover_request([1, 2]).ok
    assert not validate_discover_request("nope").ok

  def test_malformed_request_fails_through_process_with_32602(self):
    req = valid_request()
    del req["params"]["_meta"][PROTOCOL_VERSION_META_KEY]
    outcome = process_discover_request(config(), req)
    assert not outcome.ok
    assert outcome.error["code"] == INVALID_PARAMS_CODE


# ─── AC-08.3 — extra _meta keys accepted (R-5.3.1-e) ──────────────────────────


class TestExtraMetaKeys:
  def test_validate_accepts_additional_meta_keys(self):
    req = valid_request()
    req["params"]["_meta"]["com.example/trace"] = "abc"
    req["params"]["_meta"]["progressToken"] = 42
    assert validate_discover_request(req).ok

  def test_process_succeeds_with_extra_meta_keys(self):
    req = valid_request()
    req["params"]["_meta"]["com.example/trace"] = "abc"
    assert process_discover_request(config(versions=(CURRENT_PROTOCOL_VERSION,)), req).ok

  def test_build_request_carries_extra_meta_alongside_reserved(self):
    req = build_discover_request(
      7, "2026-07-28", {"name": "c", "version": "1.0.0"}, {}, extra_meta={"com.example/tenant": "acme"}
    )
    meta = req["params"]["_meta"]
    assert meta["com.example/tenant"] == "acme"
    assert meta[PROTOCOL_VERSION_META_KEY] == "2026-07-28"
    assert validate_discover_request(req).ok

  def test_extra_keys_never_overwrite_reserved_three(self):
    req = build_discover_request(
      1, "2026-07-28", {"name": "c", "version": "1.0.0"}, {}, extra_meta={PROTOCOL_VERSION_META_KEY: "HACKED"}
    )
    assert req["params"]["_meta"][PROTOCOL_VERSION_META_KEY] == "2026-07-28"


# ─── AC-08.4 — unsupported revision → -32004 (R-5.3.1-f, R-5.3.1-g) ────────────


class TestUnsupportedRevision:
  def test_does_not_throw_or_hang_and_returns_32004(self):
    outcome = process_discover_request(config(versions=(CURRENT_PROTOCOL_VERSION,)), valid_request("2019-01-01"))
    assert not outcome.ok
    assert outcome.error["code"] == UNSUPPORTED_PROTOCOL_VERSION_CODE
    assert outcome.error["code"] == -32004

  def test_data_supported_lists_revisions_and_requested_echoed(self):
    cfg = DiscoverConfig(
      supported_versions=["2026-07-28", "2025-03-26"], capabilities={}, server_info=EXAMPLE_SERVER_INFO
    )
    outcome = process_discover_request(cfg, valid_request("2019-01-01"))
    assert not outcome.ok
    assert outcome.error["data"]["supported"] == ["2026-07-28", "2025-03-26"]
    assert outcome.error["data"]["requested"] == "2019-01-01"

  def test_builder_matches_5_3_3_error_wire_example(self):
    err = build_unsupported_protocol_version_error("2019-01-01", ["2026-07-28"])
    assert err == {
      "code": -32004,
      "message": "Unsupported protocol version",
      "data": {"supported": ["2026-07-28"], "requested": "2019-01-01"},
    }

  def test_builder_copies_supported_array(self):
    supported = ["2026-07-28"]
    err = build_unsupported_protocol_version_error("x", supported)
    supported.append("mutated")
    assert err["data"]["supported"] == ["2026-07-28"]

  def test_server_tolerates_probing_same_config_both_ways(self):
    cfg = config(versions=(CURRENT_PROTOCOL_VERSION,))
    assert process_discover_request(cfg, valid_request(CURRENT_PROTOCOL_VERSION)).ok
    assert not process_discover_request(cfg, valid_request("1999-09-09")).ok


# ─── AC-08.5 — result carries resultType (R-5.3.2-a) ──────────────────────────


class TestResultType:
  def test_build_sets_result_type_complete(self):
    assert build_discover_result(config())["resultType"] == "complete"

  def test_is_discover_result_rejects_missing_result_type(self):
    assert not is_discover_result(
      {"supportedVersions": ["2026-07-28"], "capabilities": {}, "serverInfo": {"name": "S", "version": "1"}}
    )


# ─── AC-08.6 — supportedVersions non-empty string[] (R-5.3.2-b, R-5.3.2-c) ─────


class TestSupportedVersions:
  def test_accepts_non_empty_string_array(self):
    assert is_discover_result(
      {
        "resultType": "complete",
        "supportedVersions": ["2026-07-28"],
        "capabilities": {},
        "serverInfo": {"name": "S", "version": "1"},
      }
    )

  def test_rejects_empty_supported_versions(self):
    assert not is_discover_result(
      {
        "resultType": "complete",
        "supportedVersions": [],
        "capabilities": {},
        "serverInfo": {"name": "S", "version": "1"},
      }
    )

  def test_rejects_non_string_elements(self):
    assert not is_discover_result(
      {
        "resultType": "complete",
        "supportedVersions": ["2026-07-28", 7],
        "capabilities": {},
        "serverInfo": {"name": "S", "version": "1"},
      }
    )

  def test_build_raises_when_empty(self):
    with pytest.raises(ValueError):
      build_discover_result(config(versions=()))

  def test_is_version_supported_exact_string_membership(self):
    assert is_version_supported(["2026-07-28"], "2026-07-28")
    assert not is_version_supported(["2026-07-28"], "2026-07-29")
    assert not is_version_supported(["2026-07-28"], " 2026-07-28")


# ─── AC-08.7 — order is not a preference signal (R-5.3.2-d) ────────────────────


class TestSelectRevisionOrderIndependence:
  def test_same_revision_regardless_of_server_order(self):
    client_pref = ["2026-07-28", "2025-03-26"]
    a = select_revision(["2025-03-26", "2026-07-28"], client_pref)
    b = select_revision(["2026-07-28", "2025-03-26"], client_pref)
    assert a == "2026-07-28"
    assert b == "2026-07-28"
    assert a == b

  def test_reordering_supported_versions_does_not_change_selection(self):
    server = ["2024-01-01", "2025-03-26", "2026-07-28"]
    reversed_server = list(reversed(server))
    pref = ["2025-03-26", "2026-07-28", "2024-01-01"]
    assert select_revision(server, pref) == select_revision(reversed_server, pref)
    assert select_revision(server, pref) == "2025-03-26"

  def test_defaults_to_current_revision(self):
    assert select_revision(["2025-03-26", CURRENT_PROTOCOL_VERSION]) == CURRENT_PROTOCOL_VERSION

  def test_returns_none_when_no_shared_revision(self):
    assert select_revision(["2026-07-28"], ["1999-01-01"]) is None


# ─── AC-08.8 — capabilities present; {} valid (R-5.3.2-e) ──────────────────────


class TestCapabilities:
  def test_accepts_empty_capabilities(self):
    assert is_discover_result(
      {
        "resultType": "complete",
        "supportedVersions": ["2026-07-28"],
        "capabilities": {},
        "serverInfo": {"name": "S", "version": "1"},
      }
    )

  def test_accepts_populated_capabilities(self):
    assert is_discover_result(
      {
        "resultType": "complete",
        "supportedVersions": ["2026-07-28"],
        "capabilities": {"tools": {}},
        "serverInfo": {"name": "S", "version": "1"},
      }
    )

  def test_rejects_missing_capabilities(self):
    assert not is_discover_result(
      {"resultType": "complete", "supportedVersions": ["2026-07-28"], "serverInfo": {"name": "S", "version": "1"}}
    )


# ─── AC-08.9 — serverInfo requires name + version (R-5.3.2-f) ──────────────────


class TestServerInfo:
  def test_accepts_string_name_and_version(self):
    assert is_discover_result(
      {
        "resultType": "complete",
        "supportedVersions": ["2026-07-28"],
        "capabilities": {},
        "serverInfo": {"name": "S", "version": "1.0.0"},
      }
    )

  def test_rejects_missing_version(self):
    assert not is_discover_result(
      {
        "resultType": "complete",
        "supportedVersions": ["2026-07-28"],
        "capabilities": {},
        "serverInfo": {"name": "S"},
      }
    )

  def test_rejects_missing_name(self):
    assert not is_discover_result(
      {
        "resultType": "complete",
        "supportedVersions": ["2026-07-28"],
        "capabilities": {},
        "serverInfo": {"version": "1.0.0"},
      }
    )

  def test_rejects_missing_server_info(self):
    assert not is_discover_result(
      {"resultType": "complete", "supportedVersions": ["2026-07-28"], "capabilities": {}}
    )


# ─── AC-08.10 — instructions is a guidance string (R-5.3.2-g/h/i) ──────────────


class TestInstructionsField:
  def test_accepts_instructions_string(self):
    assert is_discover_result(
      {
        "resultType": "complete",
        "supportedVersions": ["2026-07-28"],
        "capabilities": {},
        "serverInfo": {"name": "S", "version": "1"},
        "instructions": "Prefer search before analysis for large repositories.",
      }
    )

  def test_rejects_non_string_instructions(self):
    assert not is_discover_result(
      {
        "resultType": "complete",
        "supportedVersions": ["2026-07-28"],
        "capabilities": {},
        "serverInfo": {"name": "S", "version": "1"},
        "instructions": 123,
      }
    )

  def test_build_includes_instructions_only_when_provided(self):
    assert "instructions" not in build_discover_result(config())
    with_instr = build_discover_result(config(instructions="Use X then Y."))
    assert with_instr["instructions"] == "Use X then Y."


# ─── AC-08.11 — absent instructions → no fabricated guidance (R-5.3.2-j) ───────


class TestResolveInstructionsNoFabrication:
  def test_returns_none_when_absent(self):
    assert resolve_instructions(build_discover_result(config())) is None

  def test_returns_string_when_present(self):
    assert resolve_instructions({"instructions": "do X"}) == "do X"

  def test_returns_none_for_non_string_no_coercion(self):
    assert resolve_instructions({"instructions": 123}) is None
    assert resolve_instructions({}) is None


# ─── AC-08.12 — result-level _meta accepted (R-5.3.2-k) ────────────────────────


class TestResultLevelMeta:
  def test_accepts_meta(self):
    assert is_discover_result(
      {
        "resultType": "complete",
        "supportedVersions": ["2026-07-28"],
        "capabilities": {},
        "serverInfo": {"name": "S", "version": "1"},
        "_meta": {"io.modelcontextprotocol/foo": "bar"},
      }
    )

  def test_build_includes_meta_only_when_provided(self):
    assert "_meta" not in build_discover_result(config())
    with_meta = build_discover_result(config(meta={"x.y/z": 1}))
    assert with_meta["_meta"] == {"x.y/z": 1}

  def test_rejects_non_dict_meta(self):
    assert not is_discover_result(
      {
        "resultType": "complete",
        "supportedVersions": ["2026-07-28"],
        "capabilities": {},
        "serverInfo": {"name": "S", "version": "1"},
        "_meta": "not-a-map",
      }
    )


# ─── JSON-RPC envelopes ────────────────────────────────────────────────────────


class TestResponseEnvelope:
  def test_build_produces_valid_success_envelope(self):
    response = build_discover_response(1, config())
    assert response["jsonrpc"] == "2.0"
    assert response["id"] == 1
    assert response["result"]["resultType"] == "complete"
    assert is_discover_result(response["result"])

  def test_echoes_string_id_without_coercion(self):
    response = build_discover_response("req-9", config())
    assert response["id"] == "req-9"

  def test_minimal_5_3_3_result_example_is_valid(self):
    envelope = {
      "jsonrpc": "2.0",
      "id": 2,
      "result": {
        "resultType": "complete",
        "supportedVersions": ["2026-07-28"],
        "capabilities": {},
        "serverInfo": EXAMPLE_SERVER_INFO,
      },
    }
    assert envelope["jsonrpc"] == "2.0"
    assert is_discover_result(envelope["result"])
