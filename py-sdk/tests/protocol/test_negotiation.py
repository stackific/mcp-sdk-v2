"""Tests for revision selection + negotiation errors + the §5.7 probe (§5.4–§5.7).

Mirrors the TS suite ts-sdk/src/__tests__/protocol/negotiation.test.ts (AC-09.1 –
AC-09.18) case-for-case, adapting the dataclass/dict convention, plus edge cases. Every
existing test is retained.
"""

from mcp.protocol.discovery import build_discover_response, DiscoverConfig
from mcp.protocol.negotiation import (
  MISSING_CLIENT_CAPABILITY_CODE,
  NEGOTIATION_ERROR_HTTP_STATUS,
  SERVER_DISCOVER_IS_OPTIONAL,
  SERVER_DISCOVER_METHOD,
  UNSUPPORTED_PROTOCOL_VERSION_CODE,
  IncompatibleProtocolError,
  ProtocolSupportCache,
  ProtocolSupportDetermination,
  augment_client_capabilities,
  build_missing_capability_error,
  build_unsupported_protocol_version_error,
  can_satisfy_required_capabilities,
  determination_from_probe,
  http_status_for_negotiation_error,
  interpret_probe_response,
  name_supported_revisions_in_error,
  negotiate_revision,
  reselect_after_unsupported_version,
)

SERVER_INFO = {"name": "s", "version": "1"}


class TestHttpStatus:
  def test_negotiation_codes(self):
    assert http_status_for_negotiation_error(UNSUPPORTED_PROTOCOL_VERSION_CODE) == NEGOTIATION_ERROR_HTTP_STATUS
    assert http_status_for_negotiation_error(MISSING_CLIENT_CAPABILITY_CODE) == NEGOTIATION_ERROR_HTTP_STATUS
    assert http_status_for_negotiation_error(-32601) is None


class TestNegotiateRevision:
  def test_client_order_wins(self):
    r = negotiate_revision(["a", "b"], ["b", "a"])
    assert r.ok and r.selected == "a"

  def test_no_mutual(self):
    r = negotiate_revision(["z"], ["a", "b"])
    assert not r.ok and r.reason == "no-mutual-revision"
    assert r.client_preference == ["z"] and r.server_supported == ["a", "b"]


class TestReselect:
  def test_from_error_supported(self):
    err = build_unsupported_protocol_version_error("z", ["2026-07-28"])
    r = reselect_after_unsupported_version(err, ["2026-07-28"])
    assert r.ok and r.selected == "2026-07-28"

  def test_terminal_when_no_overlap(self):
    err = build_unsupported_protocol_version_error("z", ["a"])
    assert not reselect_after_unsupported_version(err, ["b"]).ok


class TestCapabilityRetry:
  def test_can_satisfy(self):
    assert can_satisfy_required_capabilities({"sampling": {}}, {"sampling": {}, "roots": {}})
    assert not can_satisfy_required_capabilities({"sampling": {}}, {"roots": {}})

  def test_augment(self):
    merged = augment_client_capabilities({"roots": {}}, {"sampling": {}})
    assert merged == {"roots": {}, "sampling": {}}


class TestProbe:
  def test_supported(self):
    resp = build_discover_response(1, DiscoverConfig(["2026-07-28"], {}, SERVER_INFO))
    outcome = interpret_probe_response(resp)
    assert outcome.kind == "supported" and outcome.supported_versions == ["2026-07-28"]

  def test_unsupported_version(self):
    resp = {"jsonrpc": "2.0", "id": 1, "error": build_unsupported_protocol_version_error("z", ["a", "b"])}
    outcome = interpret_probe_response(resp)
    assert outcome.kind == "unsupported-version" and outcome.supported == ["a", "b"] and outcome.requested == "z"

  def test_not_this_protocol(self):
    assert interpret_probe_response(None).kind == "not-this-protocol"
    assert interpret_probe_response({"jsonrpc": "2.0", "id": 1, "error": {"code": -32601, "message": "x"}}).kind == "not-this-protocol"
    assert interpret_probe_response({"jsonrpc": "2.0", "id": 1, "result": {"foo": 1}}).kind == "not-this-protocol"

  def test_determination_from_probe(self):
    resp = build_discover_response(1, DiscoverConfig(["2026-07-28"], {}, SERVER_INFO))
    det = determination_from_probe(interpret_probe_response(resp))
    assert det.speaks_protocol and det.supported_versions == ["2026-07-28"]
    assert not determination_from_probe(interpret_probe_response(None)).speaks_protocol


class TestNameSupportedRevisions:
  def test_annotates_data(self):
    out = name_supported_revisions_in_error({"code": -1, "message": "x"}, ["a", "b"])
    assert out["data"]["supported"] == ["a", "b"]

  def test_preserves_existing_data(self):
    out = name_supported_revisions_in_error({"code": -1, "message": "x", "data": {"k": 1}}, ["a"])
    assert out["data"] == {"k": 1, "supported": ["a"]}


class TestProtocolSupportCache:
  def test_set_get_invalidate(self):
    cache = ProtocolSupportCache()
    det = ProtocolSupportDetermination(True, ["2026-07-28"])
    cache.set("http://x/mcp", det)
    assert cache.has("http://x/mcp") and cache.get("http://x/mcp") == det
    cache.invalidate("http://x/mcp")
    assert not cache.has("http://x/mcp")

  def test_entries_roundtrip(self):
    cache = ProtocolSupportCache()
    cache.set("e", ProtocolSupportDetermination(False))
    rebuilt = ProtocolSupportCache.from_entries(cache.entries())
    assert rebuilt.get("e").speaks_protocol is False


# ─── AC-09.1 — discovery optional (R-5.4-a) ───────────────────────────────────


class TestDiscoveryOptional:
  def test_exposes_optional_discovery_invariant(self):
    assert SERVER_DISCOVER_IS_OPTIONAL is True

  def test_selection_works_from_rejection_set_without_prior_discovery(self):
    # The server set came from an UnsupportedProtocolVersion error, not discovery.
    err = build_unsupported_protocol_version_error("1900-01-01", ["2026-07-28"])
    result = reselect_after_unsupported_version(err, ["2026-07-28"])
    assert result.ok


# ─── AC-09.2 — highest client-preferred, exact match (R-5.4-b) ────────────────


class TestRevisionSelectionRule:
  def test_chooses_b_given_client_ba_server_ab(self):
    result = negotiate_revision(["B", "A"], ["A", "B"])
    assert result.ok
    assert result.selected == "B"

  def test_is_exact_match_not_lexical_or_date(self):
    # "2027-01-01" sorts after "2026-07-28" but is not offered → not chosen.
    result = negotiate_revision(["2027-01-01", "2026-07-28"], ["2026-07-28"])
    assert result.ok
    assert result.selected == "2026-07-28"

  def test_independent_of_server_array_order(self):
    pref = ["2026-07-28", "2025-03-26"]
    a = negotiate_revision(pref, ["2025-03-26", "2026-07-28"])
    b = negotiate_revision(pref, ["2026-07-28", "2025-03-26"])
    assert a.ok and b.ok
    assert a.selected == b.selected == "2026-07-28"


# ─── AC-09.3 / AC-09.4 — empty intersection (R-5.4-c, R-5.4-d) ────────────────


class TestEmptyIntersection:
  def test_does_not_fabricate_a_revision(self):
    result = negotiate_revision(["2020-01-01"], ["2026-07-28"])
    assert not result.ok
    assert result.reason == "no-mutual-revision"
    assert result.selected is None

  def test_incompatible_protocol_error_surfaces_both_sides(self):
    err = IncompatibleProtocolError(["2020-01-01"], ["2026-07-28"])
    assert isinstance(err, Exception)
    assert err.code == "INCOMPATIBLE_PROTOCOL"
    assert err.client_preference == ["2020-01-01"]
    assert err.server_supported == ["2026-07-28"]
    assert "2026-07-28" in str(err)


# ─── AC-09.5 / AC-09.7 — UnsupportedProtocolVersion shape (R-5.5-a/c/d/e/f/g) ──


class TestUnsupportedProtocolVersionShape:
  def test_code_is_exactly_minus_32004(self):
    assert UNSUPPORTED_PROTOCOL_VERSION_CODE == -32004
    err = build_unsupported_protocol_version_error("1900-01-01", ["2026-07-28"])
    assert err["code"] == -32004

  def test_data_has_exactly_supported_and_requested_with_message(self):
    err = build_unsupported_protocol_version_error("1900-01-01", ["2026-07-28"])
    assert sorted(err["data"].keys()) == ["requested", "supported"]
    assert isinstance(err["data"]["supported"], list)
    assert len(err["data"]["supported"]) > 0
    assert err["data"]["requested"] == "1900-01-01"
    assert isinstance(err["message"], str)
    assert len(err["message"]) > 0

  def test_matches_9_1_wire_example(self):
    assert build_unsupported_protocol_version_error("1900-01-01", ["2026-07-28"]) == {
      "code": -32004,
      "message": "Unsupported protocol version",
      "data": {"supported": ["2026-07-28"], "requested": "1900-01-01"},
    }


# ─── AC-09.6 / AC-09.12 — HTTP 400 mapping (R-5.5-b, R-5.6-d) ──────────────────


class TestHttp400Mapping:
  def test_both_negotiation_codes_map_to_400(self):
    assert NEGOTIATION_ERROR_HTTP_STATUS == 400
    assert http_status_for_negotiation_error(-32004) == 400
    assert http_status_for_negotiation_error(-32003) == 400

  def test_unrelated_code_does_not_map(self):
    assert http_status_for_negotiation_error(-32601) is None


# ─── AC-09.8 — client re-selects and retries (R-5.5-h) ────────────────────────


class TestReselectAndRetry:
  def test_reselects_from_data_supported(self):
    err = build_unsupported_protocol_version_error("1900-01-01", ["2025-03-26", "2026-07-28"])
    result = reselect_after_unsupported_version(err, ["2026-07-28", "2025-03-26"])
    assert result.ok
    assert result.selected == "2026-07-28"


# ─── AC-09.9 — no mutual revision in data.supported (R-5.5-i, R-5.5-j) ─────────


class TestNoMutualRevisionAfterRejection:
  def test_terminal_no_mutual_revision_no_infinite_retry(self):
    err = build_unsupported_protocol_version_error("1900-01-01", ["2026-07-28"])
    result = reselect_after_unsupported_version(err, ["2020-01-01"])
    assert not result.ok
    assert result.reason == "no-mutual-revision"

  def test_result_carries_enough_to_build_incompatible_error(self):
    err = build_unsupported_protocol_version_error("1900-01-01", ["2026-07-28"])
    result = reselect_after_unsupported_version(err, ["2020-01-01"])
    assert not result.ok
    surfaced = IncompatibleProtocolError(result.client_preference, result.server_supported)
    assert surfaced.server_supported == ["2026-07-28"]

  def test_missing_data_is_treated_as_no_supported(self):
    # Defensive: an error lacking data.supported yields a terminal no-mutual result.
    result = reselect_after_unsupported_version({"code": -32004, "message": "x"}, ["2026-07-28"])
    assert not result.ok


# ─── AC-09.10 — per-request {} caps, no inference (R-5.6-a, R-5.6-b) ───────────


class TestPerRequestCapabilities:
  def test_empty_declaration_declares_no_optional_capabilities(self):
    assert not can_satisfy_required_capabilities({"elicitation": {}}, {})
    # A capability declared on a prior request does not carry over.
    second_request_declared = {}
    assert not can_satisfy_required_capabilities({"elicitation": {}}, second_request_declared)


# ─── AC-09.11 / AC-09.13 — MissingRequiredClientCapability shape (R-5.6-c/e/f/g/h)


class TestMissingCapabilityShape:
  def test_code_is_exactly_minus_32003(self):
    assert MISSING_CLIENT_CAPABILITY_CODE == -32003
    assert build_missing_capability_error({"elicitation": {}})["code"] == -32003

  def test_data_has_required_capabilities_with_message(self):
    err = build_missing_capability_error({"elicitation": {}})
    assert err["data"]["requiredCapabilities"] == {"elicitation": {}}
    assert isinstance(err["message"], str)
    assert len(err["message"]) > 0


# ─── AC-09.14 — client retries with the required capability (R-5.6-i) ──────────


class TestRetryWithRequiredCapability:
  def test_can_satisfy_when_client_supports_required(self):
    assert can_satisfy_required_capabilities({"elicitation": {}}, {"elicitation": {}, "sampling": {}})

  def test_augment_merges_required_into_declared_without_mutation(self):
    declared = {"sampling": {}}
    augmented = augment_client_capabilities(declared, {"elicitation": {}})
    assert augmented == {"sampling": {}, "elicitation": {}}
    assert declared == {"sampling": {}}  # unchanged


# ─── AC-09.15 — probe via server/discover (R-5.7-a, R-5.7-b) ───────────────────


class TestProbeOpeningRequest:
  def test_probe_method_is_server_discover(self):
    assert SERVER_DISCOVER_METHOD == "server/discover"

  def test_successful_discover_result_means_speaks_family(self):
    outcome = interpret_probe_response(
      {
        "jsonrpc": "2.0",
        "id": 0,
        "result": {
          "resultType": "complete",
          "supportedVersions": ["2026-07-28"],
          "capabilities": {},
          "serverInfo": {"name": "S", "version": "1"},
        },
      }
    )
    assert outcome.kind == "supported"
    assert outcome.supported_versions == ["2026-07-28"]

  def test_recognized_minus_32004_means_same_family_different_revision(self):
    outcome = interpret_probe_response(
      {
        "jsonrpc": "2.0",
        "id": 0,
        "error": {"code": -32004, "message": "x", "data": {"supported": ["2026-07-28"], "requested": "1900-01-01"}},
      }
    )
    assert outcome.kind == "unsupported-version"
    assert outcome.supported == ["2026-07-28"]


# ─── AC-09.16 — unrecognized/malformed/timeout → not-this-protocol (R-5.7-c/d) ─


class TestProbeFailureNotThisProtocol:
  def test_unknown_method_error(self):
    outcome = interpret_probe_response(
      {"jsonrpc": "2.0", "id": 0, "error": {"code": -32601, "message": "Method not found"}}
    )
    assert outcome.kind == "not-this-protocol"

  def test_malformed_result(self):
    outcome = interpret_probe_response({"jsonrpc": "2.0", "id": 0, "result": {"foo": "bar"}})
    assert outcome.kind == "not-this-protocol"

  def test_no_response_timeout(self):
    # Python's analogue of TS undefined/null is None; also exercise non-object inputs.
    assert interpret_probe_response(None).kind == "not-this-protocol"
    assert interpret_probe_response("nope").kind == "not-this-protocol"
    assert interpret_probe_response([1, 2]).kind == "not-this-protocol"


# ─── AC-09.17 — cache the determination (R-5.7-e, R-5.7-f) ─────────────────────


class TestCacheDetermination:
  def test_caches_per_endpoint_and_reports_it(self):
    cache = ProtocolSupportCache()
    outcome = interpret_probe_response(
      {
        "jsonrpc": "2.0",
        "id": 0,
        "result": {
          "resultType": "complete",
          "supportedVersions": ["2026-07-28"],
          "capabilities": {},
          "serverInfo": {"name": "S", "version": "1"},
        },
      }
    )
    cache.set("npx some-server", determination_from_probe(outcome))
    det = cache.get("npx some-server")
    assert det.speaks_protocol is True
    assert det.supported_versions == ["2026-07-28"]

  def test_persists_across_restarts_via_entries_from_entries(self):
    cache = ProtocolSupportCache()
    cache.set("e1", ProtocolSupportDetermination(False))
    restored = ProtocolSupportCache.from_entries(cache.entries())
    restored_det = restored.get("e1")
    assert restored_det.speaks_protocol is False

  def test_invalidate_drops_cached_assumption(self):
    cache = ProtocolSupportCache()
    cache.set("e1", ProtocolSupportDetermination(True, ["2026-07-28"]))
    cache.invalidate("e1")
    assert cache.has("e1") is False

  def test_minus_32004_probe_outcome_still_speaks_family(self):
    outcome = interpret_probe_response(
      {
        "jsonrpc": "2.0",
        "id": 0,
        "error": {"code": -32004, "message": "x", "data": {"supported": ["2026-07-28"], "requested": "1900-01-01"}},
      }
    )
    det = determination_from_probe(outcome)
    assert det.speaks_protocol is True
    assert det.supported_versions == ["2026-07-28"]


# ─── AC-09.18 — server names supported revisions in error (R-5.7-g) ────────────


class TestNameSupportedRevisionsAC:
  def test_adds_data_supported_to_opaque_error(self):
    annotated = name_supported_revisions_in_error({"code": -32600, "message": "Invalid Request"}, ["2026-07-28"])
    assert annotated["data"]["supported"] == ["2026-07-28"]
    assert annotated["code"] == -32600

  def test_preserves_existing_data_fields(self):
    annotated = name_supported_revisions_in_error(
      {"code": -32600, "message": "x", "data": {"detail": "y"}}, ["2026-07-28"]
    )
    assert annotated["data"] == {"detail": "y", "supported": ["2026-07-28"]}
