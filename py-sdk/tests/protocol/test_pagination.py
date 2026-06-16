"""Tests for cursor-based pagination (§12).

Mirrors ``ts-sdk/src/__tests__/protocol/pagination.test.ts`` (AC-18.1 … AC-18.16) plus
Python-side edge cases.
"""

import pytest

from mcp.protocol.pagination import (
  INVALID_CURSOR_CODE,
  PAGINATED_METHODS,
  OffsetPaginator,
  build_invalid_cursor_error,
  has_next_cursor,
  is_cursor,
  is_cursor_present,
  is_last_page,
  is_paginated_method,
  is_valid_paginated_request_params,
  is_valid_paginated_result,
  pagination_cache_key,
)


class TestCursorPredicates:
  def test_present_including_empty_string(self):
    assert has_next_cursor({"nextCursor": "abc"})
    assert has_next_cursor({"nextCursor": ""})  # empty string is PRESENT
    assert not has_next_cursor({})

  def test_last_page(self):
    assert is_last_page({})
    assert not is_last_page({"nextCursor": ""})

  def test_is_cursor_present(self):
    assert is_cursor_present("")
    assert is_cursor_present("x")
    assert not is_cursor_present(None)


class TestInvalidCursorError:
  def test_shape(self):
    err = build_invalid_cursor_error()
    assert err["code"] == INVALID_CURSOR_CODE
    assert build_invalid_cursor_error("nope")["message"] == "nope"


class TestCacheKey:
  def test_first_vs_cursor(self):
    assert pagination_cache_key("tools/list", None) == "tools/list::page:first"
    assert pagination_cache_key("tools/list", "5") == "tools/list::page:cursor:5"

  def test_first_and_empty_cursor_differ(self):
    assert pagination_cache_key("m", None) != pagination_cache_key("m", "")


class TestOffsetPaginator:
  def test_first_page_and_next_cursor(self):
    p = OffsetPaginator(list(range(5)), page_size=2)
    page = p.get_page(None)
    assert page.ok and page.items == [0, 1] and page.next_cursor == "2"

  def test_follow_cursor(self):
    p = OffsetPaginator(list(range(5)), page_size=2)
    page = p.get_page("2")
    assert page.items == [2, 3] and page.next_cursor == "4"

  def test_last_page_has_no_cursor(self):
    p = OffsetPaginator(list(range(4)), page_size=2)
    assert p.get_page("2").next_cursor is None

  def test_invalid_cursor_is_error_not_raise(self):
    p = OffsetPaginator([1, 2, 3], page_size=2)
    page = p.get_page("notanumber")
    assert not page.ok and page.error["code"] == INVALID_CURSOR_CODE

  def test_out_of_range_cursor_rejected(self):
    p = OffsetPaginator([1, 2, 3], page_size=2)
    assert not p.get_page("99").ok

  def test_bad_page_size(self):
    import pytest

    with pytest.raises(ValueError):
      OffsetPaginator([], page_size=0)


class TestCursor:
  # CursorSchema — opaque string token (§12, §3.7 / S04).
  def test_accepts_base64_and_empty_string(self):
    assert is_cursor("eyJwYWdlIjogMn0=")
    assert is_cursor("")  # AC-18.1 · R-12.1-a — "" is a valid PRESENT cursor

  def test_rejects_non_string(self):
    assert not is_cursor(42)
    assert not is_cursor(None)

  def test_opaque_json_looking_and_number_looking_cursors_accepted(self):
    # AC-18.12 — clients MUST NOT parse/decode; even JSON-looking tokens are opaque.
    assert is_cursor('{"page":2,"offset":10}')
    assert is_cursor("3")


class TestPaginatedRequestParams:
  # AC-18.2 / AC-18.3 / AC-18.4 — cursor present/absent, empty params.
  def test_accepts_cursor_present(self):
    assert is_valid_paginated_request_params({"cursor": "eyJwYWdlIjogMn0="})

  def test_accepts_absent_cursor_and_empty_object(self):
    assert is_valid_paginated_request_params({})

  def test_accepts_empty_string_cursor(self):
    assert is_valid_paginated_request_params({"cursor": ""})

  def test_rejects_non_string_cursor(self):
    assert not is_valid_paginated_request_params({"cursor": 5})

  def test_rejects_non_object_meta(self):
    assert not is_valid_paginated_request_params({"_meta": "nope"})

  def test_rejects_non_object(self):
    assert not is_valid_paginated_request_params("nope")

  def test_passthrough_method_specific_members(self):
    assert is_valid_paginated_request_params({"cursor": "c", "extra": 1})


class TestPaginatedResult:
  # AC-18.1 / AC-18.5 / AC-18.6 / AC-18.8 / AC-18.14.
  def test_accepts_next_cursor_present(self):
    assert is_valid_paginated_result(
      {"resultType": "complete", "tools": [], "nextCursor": "eyJwYWdlIjogMn0="}
    )

  def test_accepts_empty_string_next_cursor(self):
    # AC-18.8 — nextCursor="" must be echoed, not treated as end.
    result = {"resultType": "complete", "tools": [], "nextCursor": ""}
    assert is_valid_paginated_result(result)
    assert has_next_cursor(result)
    assert not is_last_page(result)

  def test_accepts_final_page_without_next_cursor(self):
    result = {"resultType": "complete", "tools": [{"name": "get_forecast"}]}
    assert is_valid_paginated_result(result)
    assert is_last_page(result)

  def test_accepts_empty_page_with_next_cursor(self):
    # AC-18.14 — empty page may still carry nextCursor (more results may follow).
    assert is_valid_paginated_result(
      {"resultType": "complete", "tools": [], "nextCursor": "eyJwYWdlIjogN30="}
    )

  def test_rejects_missing_result_type(self):
    assert not is_valid_paginated_result({"tools": [], "nextCursor": "c"})

  def test_rejects_non_string_next_cursor(self):
    assert not is_valid_paginated_result({"resultType": "complete", "nextCursor": 7})

  def test_rejects_non_object_meta(self):
    assert not is_valid_paginated_result({"resultType": "complete", "_meta": 1})

  def test_rejects_non_object(self):
    assert not is_valid_paginated_result(None)


class TestOffsetPaginatorParity:
  # Mirrors the TS OffsetPaginator describe blocks (RC-2, RC-3, RC-4).
  def test_default_page_size_is_20(self):
    assert OffsetPaginator(list(range(50))).page_size == 20

  def test_non_integer_page_size_rejected(self):
    with pytest.raises(ValueError):
      OffsetPaginator([], page_size=1.5)  # type: ignore[arg-type]

  def test_re_presenting_next_cursor_yields_next_page(self):
    pager = OffsetPaginator(["a", "b", "c", "d", "e"], 2)
    first = pager.get_page(None)
    second = pager.get_page(first.next_cursor)
    assert second.ok and second.items == ["c", "d"]
    third = pager.get_page(second.next_cursor)
    assert third.items == ["e"] and third.next_cursor is None

  def test_deterministic_cursor_for_same_position(self):
    pager = OffsetPaginator([1, 2, 3, 4, 5, 6], 2)
    assert pager.get_page(None).next_cursor == pager.get_page(None).next_cursor

  def test_cursor_re_presented_yields_same_items(self):
    pager = OffsetPaginator([1, 2, 3, 4, 5, 6], 2)
    cursor = pager.get_page(None).next_cursor
    assert pager.get_page(cursor).items == pager.get_page(cursor).items

  def test_empty_string_cursor_rejected(self):
    # "" was never issued by the paginator → unrecognized → error (not first page).
    assert not OffsetPaginator(["x", "y", "z"], 2).get_page("").ok

  def test_negative_offset_cursor_rejected(self):
    assert not OffsetPaginator(["x", "y", "z"], 2).get_page("-1").ok

  def test_server_remains_operational_after_bad_cursor(self):
    pager = OffsetPaginator(["x", "y", "z"], 2)
    pager.get_page("bad")  # does not raise
    assert pager.get_page(None).ok

  def test_empty_item_list(self):
    page = OffsetPaginator([], 10).get_page(None)
    assert page.ok and page.items == [] and page.next_cursor is None

  def test_invalid_cursor_error_payload_shape(self):
    page = OffsetPaginator(["x"], 2).get_page("not-a-number")
    assert not page.ok
    assert page.error["code"] == INVALID_CURSOR_CODE
    assert isinstance(page.error["message"], str)


class TestPaginatedMethods:
  def test_membership(self):
    assert is_paginated_method("tools/list")
    assert is_paginated_method("resources/templates/list")
    assert not is_paginated_method("tools/call")

  def test_registry_has_exactly_four_methods(self):
    assert len(PAGINATED_METHODS) == 4
    assert is_paginated_method("resources/list")
    assert is_paginated_method("prompts/list")


class TestCacheKeyParity:
  # AC-18.16 — per-cursor cache isolation.
  def test_first_page_differs_from_cursor_request(self):
    assert pagination_cache_key("tools/list", None) != pagination_cache_key(
      "tools/list", "eyJwYWdlIjogMn0="
    )

  def test_two_cursors_differ(self):
    assert pagination_cache_key("tools/list", "C1") != pagination_cache_key("tools/list", "C2")

  def test_same_cursor_different_methods_differ(self):
    assert pagination_cache_key("tools/list", "C1") != pagination_cache_key("resources/list", "C1")

  def test_same_method_and_cursor_idempotent(self):
    assert pagination_cache_key("tools/list", "C1") == pagination_cache_key("tools/list", "C1")

  def test_empty_string_cursor_distinct_from_first_page(self):
    assert pagination_cache_key("tools/list", None) != pagination_cache_key("tools/list", "")

  def test_cross_server_same_method_cursor_documents_scope(self):
    # AC-18.13 (R-12.3-n…q) — the schema/helper does NOT enforce cross-server
    # prohibition (that is a behavioral client rule); a cursor from server A presented
    # against server B yields the same method+cursor cache key, so the caller MUST
    # track which server issued the cursor. The key alone cannot distinguish origins.
    key_server_a = pagination_cache_key("tools/list", "cursorFromA")
    key_server_b = pagination_cache_key("tools/list", "cursorFromA")
    assert key_server_a == key_server_b


class TestOffsetPaginatorFirstPage:
  # Mirrors the TS "OffsetPaginator — first page (cursor absent)" describe block.
  PAGER = OffsetPaginator(["a", "b", "c", "d", "e"], 2)

  def test_first_page_is_ok(self):
    assert self.PAGER.get_page(None).ok

  def test_first_page_returns_first_page_size_items(self):
    assert self.PAGER.get_page(None).items == ["a", "b"]

  def test_first_page_returns_next_cursor_when_more_remain(self):
    assert self.PAGER.get_page(None).next_cursor is not None


class TestOffsetPaginatorCursorOpacity:
  # AC-18.12 — the paginator's cursor is a decimal-offset token, but the only
  # observable fact about a request cursor is presence; the paginator alone decides
  # whether a token is recognized (RC-3: an unknown JSON-looking token is rejected).
  def test_json_looking_cursor_is_unrecognized_not_parsed(self):
    page = OffsetPaginator([1, 2, 3, 4], 2).get_page('{"offset":2}')
    assert not page.ok and page.error["code"] == INVALID_CURSOR_CODE

  def test_boundary_cursor_equal_to_length_yields_empty_final_page(self):
    # cursor == len(items) is a recognized end cursor: empty page, no next cursor.
    page = OffsetPaginator([1, 2, 3], 2).get_page("3")
    assert page.ok and page.items == [] and page.next_cursor is None


class TestWireExamples:
  # Mirrors the TS "Wire examples (§12)" describe block.
  def test_first_page_request_empty_params(self):
    assert is_valid_paginated_request_params({})

  def test_result_with_next_cursor_from_spec(self):
    result = {
      "resultType": "complete",
      "tools": [
        {
          "name": "get_weather",
          "title": "Get Weather",
          "inputSchema": {
            "type": "object",
            "properties": {"location": {"type": "string"}},
            "required": ["location"],
          },
        }
      ],
      "nextCursor": "eyJwYWdlIjogMn0=",
    }
    assert is_valid_paginated_result(result)
    assert result["nextCursor"] == "eyJwYWdlIjogMn0="
    assert has_next_cursor(result)

  def test_follow_up_request_with_cursor_from_spec(self):
    params = {"cursor": "eyJwYWdlIjogMn0="}
    assert is_valid_paginated_request_params(params)
    assert params["cursor"] == "eyJwYWdlIjogMn0="

  def test_final_page_result_no_next_cursor(self):
    result = {
      "resultType": "complete",
      "tools": [{"name": "get_forecast", "title": "Get Forecast", "inputSchema": {}}],
    }
    assert is_valid_paginated_result(result)
    assert is_last_page(result)
