"""Tests for protocol revision carrying + HTTP header mirror check (§5.1–§5.2)."""

from mcp.protocol.revision import (
  CURRENT_PROTOCOL_VERSION,
  MCP_PROTOCOL_VERSION_HEADER,
  check_http_revision_header,
  is_supported_protocol_version,
  is_valid_revision_format,
)


class TestReexports:
  def test_current_and_predicates(self):
    assert is_supported_protocol_version(CURRENT_PROTOCOL_VERSION)
    assert is_valid_revision_format("2026-07-28")
    assert not is_valid_revision_format("nope")


class TestHttpHeaderCheck:
  def test_match(self):
    assert check_http_revision_header("2026-07-28", "2026-07-28").ok

  def test_no_header_non_http(self):
    assert check_http_revision_header(None, "2026-07-28").ok

  def test_mismatch_is_400(self):
    result = check_http_revision_header("2025-01-01", "2026-07-28")
    assert not result.ok
    assert result.status == 400
    assert MCP_PROTOCOL_VERSION_HEADER in result.message
