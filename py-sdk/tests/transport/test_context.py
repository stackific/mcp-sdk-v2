"""Tests for the §7.6 per-request context derived from a request's _meta envelope."""

from mcp.protocol.meta import (
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  PROTOCOL_VERSION_META_KEY,
)
from mcp.transport.contract import (
  derive_request_context,
  extract_envelope_for_mirroring,
  request_carries_meta_envelope,
)


def request_with_envelope() -> dict:
  return {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list",
    "params": {
      "_meta": {
        PROTOCOL_VERSION_META_KEY: "2026-07-28",
        CLIENT_INFO_META_KEY: {"name": "c", "version": "1.0"},
        CLIENT_CAPABILITIES_META_KEY: {"sampling": {}},
      }
    },
  }


class TestCarriesEnvelope:
  def test_true_for_valid(self):
    assert request_carries_meta_envelope(request_with_envelope())

  def test_false_without_meta(self):
    assert not request_carries_meta_envelope({"jsonrpc": "2.0", "id": 1, "method": "m"})

  def test_false_for_incomplete_meta(self):
    req = request_with_envelope()
    del req["params"]["_meta"][PROTOCOL_VERSION_META_KEY]
    assert not request_carries_meta_envelope(req)


class TestDeriveContext:
  def test_derives_from_meta_only(self):
    ctx = derive_request_context(request_with_envelope())
    assert ctx is not None
    assert ctx.protocol_version == "2026-07-28"
    assert ctx.client_info == {"name": "c", "version": "1.0"}
    assert ctx.client_capabilities == {"sampling": {}}

  def test_none_when_invalid(self):
    assert derive_request_context({"jsonrpc": "2.0", "id": 1, "method": "m"}) is None
    assert derive_request_context("not a request") is None

  def test_two_requests_independent(self):
    a = request_with_envelope()
    b = request_with_envelope()
    b["params"]["_meta"][PROTOCOL_VERSION_META_KEY] = "2026-07-28"
    b["params"]["_meta"][CLIENT_INFO_META_KEY] = {"name": "other", "version": "9.9"}
    ctx_a = derive_request_context(a)
    ctx_b = derive_request_context(b)
    assert ctx_a.client_info != ctx_b.client_info  # connection contributes nothing


class TestMirroring:
  def test_mirror_equals_derive(self):
    req = request_with_envelope()
    assert extract_envelope_for_mirroring(req) == derive_request_context(req)

  def test_none_without_envelope(self):
    assert extract_envelope_for_mirroring({"params": {}}) is None
