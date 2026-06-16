"""Tests for protocol revision carrying + HTTP header mirror check (§5.1–§5.2, S07).

Mirrors the TS suite ``src/__tests__/protocol/revision.test.ts``, AC-mapped:

  AC-07.1 (R-5.1-a) — exact-match comparison for revision identifiers.
  AC-07.2 (R-5.1-b) — no lexical/chronological/range comparison.
  AC-07.3 (R-5.1-c) — no session-revision inheritance (each request standalone).
  AC-07.4 (R-5.2-a) — protocolVersion key REQUIRED on every request.
  AC-07.5 (R-5.2-b) — value must be a YYYY-MM-DD string; the gate rejects malformed.
  AC-07.6 (R-5.2-c) — HTTP transport mirrors revision in the header.
  AC-07.7 (R-5.2-d) — header matches _meta value → accepted.
  AC-07.8 (R-5.2-e) — header mismatches _meta value → 400 Bad Request.
"""

from mcp.protocol.meta import (
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  PROTOCOL_VERSION_META_KEY,
  validate_request_meta,
)
from mcp.protocol.revision import (
  CURRENT_PROTOCOL_VERSION,
  HTTP_REVISION_MISMATCH_STATUS,
  MCP_PROTOCOL_VERSION_HEADER,
  PROTOCOL_REVISION_FORMAT_RE,
  check_http_revision_header,
  is_supported_protocol_version,
  is_valid_revision_format,
)


class TestReexports:
  def test_current_and_predicates(self):
    assert is_supported_protocol_version(CURRENT_PROTOCOL_VERSION)
    assert is_valid_revision_format("2026-07-28")
    assert not is_valid_revision_format("nope")


# ─── CURRENT_PROTOCOL_VERSION ─────────────────────────────────────────────────


class TestCurrentProtocolVersion:
  def test_is_expected_string(self):
    assert CURRENT_PROTOCOL_VERSION == "2026-07-28"

  def test_matches_format(self):
    assert is_valid_revision_format(CURRENT_PROTOCOL_VERSION)


# ─── AC-07.1 / AC-07.2 / AC-07.3 — exact-match, no ordering, per-request ───────


class TestIsSupportedExactMatch:
  def test_supports_exact_current(self):
    assert is_supported_protocol_version("2026-07-28")

  def test_rejects_one_char_difference(self):
    assert not is_supported_protocol_version("2026-07-29")

  def test_rejects_trailing_space(self):
    assert not is_supported_protocol_version("2026-07-28 ")

  def test_rejects_leading_space(self):
    assert not is_supported_protocol_version(" 2026-07-28")

  def test_rejects_single_digit_month_variant(self):
    assert not is_supported_protocol_version("2026-7-28")

  def test_rejects_empty_string(self):
    assert not is_supported_protocol_version("")

  def test_no_lexical_or_chronological_ordering(self):
    # AC-07.2: a later/earlier date is never "supported" by comparison.
    assert not is_supported_protocol_version("2027-01-01")
    assert not is_supported_protocol_version("2099-12-31")
    assert not is_supported_protocol_version("2025-01-01")

  def test_per_request_independence(self):
    # AC-07.3: each call is evaluated standalone; no inheritance across requests.
    assert is_supported_protocol_version("2026-07-28")
    assert not is_supported_protocol_version("2025-01-01")


# ─── AC-07.5 — value must be a YYYY-MM-DD string (R-5.2-b) ────────────────────


class TestRevisionFormat:
  def test_accepts_current_format(self):
    assert is_valid_revision_format("2026-07-28")

  def test_accepts_any_yyyy_mm_dd(self):
    assert is_valid_revision_format("2025-01-01")
    assert is_valid_revision_format("2099-12-31")

  def test_rejects_numeric_string_without_separators(self):
    assert not PROTOCOL_REVISION_FORMAT_RE.match("20260728")

  def test_rejects_single_digit_month(self):
    assert not is_valid_revision_format("2026-7-28")

  def test_rejects_iso_datetime(self):
    assert not is_valid_revision_format("2026-07-28T00:00:00Z")

  def test_rejects_empty_string(self):
    assert not is_valid_revision_format("")

  def test_rejects_non_date_strings(self):
    assert not is_valid_revision_format("latest")
    assert not is_valid_revision_format("v1.0")
    assert not is_valid_revision_format("draft")

  def test_rejects_extra_whitespace(self):
    assert not is_valid_revision_format(" 2026-07-28")
    assert not is_valid_revision_format("2026-07-28 ")


# ─── AC-07.4 / AC-07.5 — the request gate (validate_request_meta) ─────────────


def _base() -> dict:
  return {
    CLIENT_INFO_META_KEY: {"name": "test", "version": "1.0.0"},
    CLIENT_CAPABILITIES_META_KEY: {},
  }


class TestRequestGate:
  def test_rejects_when_protocol_version_absent(self):
    result = validate_request_meta(_base())
    assert not result.ok and result.code == -32602

  def test_accepts_when_all_three_keys_present(self):
    meta = _base()
    meta[PROTOCOL_VERSION_META_KEY] = "2026-07-28"
    assert validate_request_meta(meta).ok

  def test_rejects_slash_separated_date(self):
    meta = _base()
    meta[PROTOCOL_VERSION_META_KEY] = "2026/07/28"
    result = validate_request_meta(meta)
    assert not result.ok and result.code == -32602

  def test_rejects_non_date_label(self):
    meta = _base()
    meta[PROTOCOL_VERSION_META_KEY] = "latest"
    assert not validate_request_meta(meta).ok

  def test_accepts_well_formed_even_if_unsupported(self):
    # Format validity is independent of support: a well-formed but unsupported revision
    # passes the gate; negotiation handles support separately.
    meta = _base()
    meta[PROTOCOL_VERSION_META_KEY] = "2019-01-01"
    assert validate_request_meta(meta).ok


# ─── AC-07.6 — header constant ────────────────────────────────────────────────


class TestHeaderConstant:
  def test_header_name(self):
    assert MCP_PROTOCOL_VERSION_HEADER == "MCP-Protocol-Version"


# ─── AC-07.7 / AC-07.8 — check_http_revision_header ───────────────────────────


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

  def test_mismatch_whitespace_is_400(self):
    result = check_http_revision_header("2026-07-28 ", "2026-07-28")
    assert not result.ok and result.status == 400

  def test_empty_header_vs_set_meta_is_400(self):
    result = check_http_revision_header("", "2026-07-28")
    assert not result.ok and result.status == 400

  def test_mismatch_message_is_non_empty_string(self):
    result = check_http_revision_header("2025-01-01", "2026-07-28")
    assert not result.ok
    assert isinstance(result.message, str) and len(result.message) > 0

  def test_status_constant_is_400(self):
    assert HTTP_REVISION_MISMATCH_STATUS == 400
