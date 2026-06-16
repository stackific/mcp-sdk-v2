using Stackific.Mcp.JsonRpc;
using Stackific.Mcp.Protocol;

namespace Stackific.Mcp.Tests.Protocol;

/// <summary>
/// Behavioral tests for §12 cursor-based pagination — the cursor predicates (with the
/// <c>""</c>-is-present-not-end invariant), the per-cursor cache-key helper, the invalid-cursor error
/// builder, the paginated-method registry, and the reference <see cref="OffsetPaginator{T}"/> that
/// NEVER throws on a bad cursor. Mirrors the TypeScript <c>pagination.test.ts</c> scenarios.
/// </summary>
public sealed class PaginationTests
{
  // ── Cursor presence predicates (AC-18.1, AC-18.6, AC-18.8 · R-12.1-a, R-12.3-c/d) ──

  [Fact]
  public void Is_cursor_present_is_true_for_empty_string_and_false_only_for_null()
  {
    Assert.True(PaginationUtilities.IsCursorPresent(""));
    Assert.True(PaginationUtilities.IsCursorPresent("any-value"));
    Assert.False(PaginationUtilities.IsCursorPresent(null));
  }

  [Fact]
  public void Has_next_cursor_treats_empty_string_as_present()
  {
    Assert.True(PaginationUtilities.HasNextCursor(""));
    Assert.True(PaginationUtilities.HasNextCursor("C1"));
    Assert.False(PaginationUtilities.HasNextCursor(null));
  }

  [Fact]
  public void Is_last_page_only_when_cursor_absent()
  {
    Assert.True(PaginationUtilities.IsLastPage(null));
    Assert.False(PaginationUtilities.IsLastPage(""));   // empty string is NOT end-of-results
    Assert.False(PaginationUtilities.IsLastPage("C1"));
  }

  // ── Paginated-method registry (§12) ──

  [Theory]
  [InlineData("tools/list", true)]
  [InlineData("resources/list", true)]
  [InlineData("resources/templates/list", true)]
  [InlineData("prompts/list", true)]
  [InlineData("tools/call", false)]
  public void Is_paginated_method_recognizes_the_four_list_methods(string method, bool expected)
  {
    Assert.Equal(expected, PaginationUtilities.IsPaginatedMethod(method));
  }

  [Fact]
  public void Paginated_methods_contains_exactly_four()
  {
    Assert.Equal(4, PaginationUtilities.PaginatedMethods.Count);
  }

  // ── Invalid-cursor error (AC-18.15 · R-12.4-c/d) ──

  [Fact]
  public void Invalid_cursor_code_is_minus_32602()
  {
    Assert.Equal(-32602, PaginationUtilities.InvalidCursorCode);
    Assert.Equal(ErrorCodes.InvalidParams, PaginationUtilities.InvalidCursorCode);
  }

  [Fact]
  public void Build_invalid_cursor_error_uses_default_and_custom_messages()
  {
    var def = PaginationUtilities.BuildInvalidCursorError();
    Assert.Equal(-32602, def.Code);
    Assert.Equal("Invalid params: unrecognized cursor", def.Message);

    var custom = PaginationUtilities.BuildInvalidCursorError("cursor has expired");
    Assert.Equal("cursor has expired", custom.Message);
  }

  // ── Per-cursor cache isolation (AC-18.16 · R-12.5-a) ──

  [Fact]
  public void First_page_key_differs_from_a_cursor_bearing_key()
  {
    var first = PaginationUtilities.PaginationCacheKey("tools/list", null);
    var page2 = PaginationUtilities.PaginationCacheKey("tools/list", "eyJwYWdlIjogMn0=");
    Assert.NotEqual(first, page2);
  }

  [Fact]
  public void Empty_string_cursor_key_differs_from_first_page_key()
  {
    var first = PaginationUtilities.PaginationCacheKey("tools/list", null);
    var empty = PaginationUtilities.PaginationCacheKey("tools/list", "");
    Assert.NotEqual(first, empty);
  }

  [Fact]
  public void Different_cursors_and_methods_produce_different_keys_but_same_inputs_are_idempotent()
  {
    Assert.NotEqual(
      PaginationUtilities.PaginationCacheKey("tools/list", "C1"),
      PaginationUtilities.PaginationCacheKey("tools/list", "C2"));
    Assert.NotEqual(
      PaginationUtilities.PaginationCacheKey("tools/list", "C1"),
      PaginationUtilities.PaginationCacheKey("resources/list", "C1"));
    Assert.Equal(
      PaginationUtilities.PaginationCacheKey("tools/list", "C1"),
      PaginationUtilities.PaginationCacheKey("tools/list", "C1"));
  }

  // ── OffsetPaginator constructor (RC-2) ──

  [Fact]
  public void Paginator_accepts_a_valid_page_size_and_defaults_to_twenty()
  {
    Assert.Equal(2, new OffsetPaginator<int>([1, 2, 3], 2).PageSize);
    Assert.Equal(20, new OffsetPaginator<int>(Enumerable.Range(0, 50).ToList()).PageSize);
  }

  [Theory]
  [InlineData(0)]
  [InlineData(-1)]
  public void Paginator_rejects_a_non_positive_page_size(int pageSize)
  {
    Assert.Throws<ArgumentOutOfRangeException>(() => new OffsetPaginator<int>([], pageSize));
  }

  // ── OffsetPaginator paging (AC-18.2, AC-18.3, AC-18.6) ──

  [Fact]
  public void First_page_returns_the_first_page_size_items_and_a_next_cursor()
  {
    var pager = new OffsetPaginator<string>(["a", "b", "c", "d", "e"], 2);
    var page = pager.GetPage(null);
    Assert.True(page.Ok);
    Assert.Equal(["a", "b"], page.Items);
    Assert.NotNull(page.NextCursor);
  }

  [Fact]
  public void Subsequent_pages_follow_the_next_cursor_to_the_final_page()
  {
    var pager = new OffsetPaginator<string>(["a", "b", "c", "d", "e"], 2);
    var first = pager.GetPage(null);
    var second = pager.GetPage(first.NextCursor);
    Assert.Equal(["c", "d"], second.Items);
    var third = pager.GetPage(second.NextCursor);
    Assert.Equal(["e"], third.Items);
    Assert.Null(third.NextCursor); // last page has no next cursor
  }

  [Fact]
  public void Cursors_are_deterministic_decimal_offsets()
  {
    var pager = new OffsetPaginator<int>([1, 2, 3, 4, 5, 6], 2);
    var a = pager.GetPage(null);
    var b = pager.GetPage(null);
    Assert.Equal(a.NextCursor, b.NextCursor);
    // The cursor is a plain decimal offset, NOT base64 (matches TS).
    Assert.Equal("2", a.NextCursor);
  }

  // ── OffsetPaginator invalid-cursor handling — NEVER throws (RC-3, RC-4) ──

  [Theory]
  [InlineData("not-a-number")]
  [InlineData("")]      // empty string was not issued by this paginator
  [InlineData("-1")]    // negative offset
  [InlineData("9999")]  // out of bounds
  public void Paginator_returns_a_structured_error_for_a_bad_cursor_without_throwing(string cursor)
  {
    var pager = new OffsetPaginator<string>(["x", "y", "z"], 2);
    var result = pager.GetPage(cursor);
    Assert.False(result.Ok);
    Assert.NotNull(result.Error);
    Assert.Equal(-32602, result.Error!.Code);
  }

  [Fact]
  public void Paginator_remains_operational_after_a_bad_cursor()
  {
    var pager = new OffsetPaginator<string>(["x", "y", "z"], 2);
    pager.GetPage("bad"); // does not throw
    var valid = pager.GetPage(null);
    Assert.True(valid.Ok);
  }

  [Fact]
  public void Empty_item_list_returns_an_empty_page_with_no_next_cursor()
  {
    var pager = new OffsetPaginator<string>([], 10);
    var page = pager.GetPage(null);
    Assert.True(page.Ok);
    Assert.Empty(page.Items);
    Assert.Null(page.NextCursor);
  }
}
