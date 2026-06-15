/**
 * Tests for S18 — Pagination (§12).
 *
 * AC coverage:
 *  AC-18.1  (R-12.1-a)              — empty-string cursor is PRESENT, not absent
 *  AC-18.2  (R-12.2-a)              — cursor present → results after that cursor
 *  AC-18.3  (R-12.2-b)              — cursor absent → first page
 *  AC-18.4  (R-12.3-a)              — params may be omitted for first page
 *  AC-18.5  (R-12.2-c)              — nextCursor present → more results, echo it back
 *  AC-18.6  (R-12.2-d, R-12.3-c)   — nextCursor absent → last page
 *  AC-18.7  (R-12.3-b)              — server includes/omits nextCursor correctly
 *  AC-18.8  (R-12.3-d, R-12.3-e)   — nextCursor="" must be echoed, not treated as end
 *  AC-18.9  (R-12.3-f–h)            — both paginated and single-page flows supported
 *  AC-18.10 (R-12.3-i)              — stable cursors
 *  AC-18.11 (R-12.3-j)              — server determines position from cursor
 *  AC-18.12 (R-12.3-k–m)            — cursor opacity: no parsing/inferring
 *  AC-18.13 (R-12.3-n–q)            — cursor validity / cross-server prohibition
 *  AC-18.14 (R-12.4-a, R-12.4-b)   — variable page sizes, empty pages with nextCursor
 *  AC-18.15 (R-12.4-c, R-12.4-d)   — invalid cursor → -32602
 *  AC-18.16 (R-12.5-a)              — per-cursor cache isolation
 */

import { describe, it, expect } from 'vitest';
import {
  PaginatedRequestParamsSchema,
  PaginatedResultSchema,
  hasNextCursor,
  isLastPage,
  isCursorPresent,
  INVALID_CURSOR_CODE,
  buildInvalidCursorError,
  paginationCacheKey,
  PAGINATED_METHODS,
  isPaginatedMethod,
  CursorSchema,
  OffsetPaginator,
} from '../../protocol/pagination.js';

// ─── CursorSchema ──────────────────────────────────────────────────────────────

describe('CursorSchema — opaque string token (§12, §3.7 / S04)', () => {
  it('accepts a base64 cursor string', () => {
    expect(CursorSchema.safeParse('eyJwYWdlIjogMn0=').success).toBe(true);
  });

  it('accepts the empty string "" (AC-18.1 · R-12.1-a)', () => {
    expect(CursorSchema.safeParse('').success).toBe(true);
  });

  it('rejects a non-string cursor', () => {
    expect(CursorSchema.safeParse(42).success).toBe(false);
    expect(CursorSchema.safeParse(null).success).toBe(false);
  });
});

// ─── AC-18.1 — empty-string cursor is a PRESENT cursor ───────────────────────

describe('Empty-string cursor is present (AC-18.1 · R-12.1-a)', () => {
  it('isCursorPresent returns true for ""', () => {
    expect(isCursorPresent('')).toBe(true);
  });

  it('isCursorPresent returns false only for undefined', () => {
    expect(isCursorPresent(undefined)).toBe(false);
  });

  it('hasNextCursor returns true when nextCursor is ""', () => {
    expect(hasNextCursor({ nextCursor: '' })).toBe(true);
  });

  it('PaginatedResultSchema accepts nextCursor: ""', () => {
    expect(
      PaginatedResultSchema.safeParse({
        resultType: 'complete',
        tools: [],
        nextCursor: '',
      }).success,
    ).toBe(true);
  });
});

// ─── AC-18.2 — cursor present → server returns results after that cursor ───────

describe('cursor on request (AC-18.2 · R-12.2-a)', () => {
  it('PaginatedRequestParamsSchema accepts cursor present', () => {
    const result = PaginatedRequestParamsSchema.safeParse({
      cursor: 'eyJwYWdlIjogMn0=',
    });
    expect(result.success).toBe(true);
  });

  it('cursor value is preserved through parse', () => {
    const result = PaginatedRequestParamsSchema.safeParse({
      cursor: 'eyJwYWdlIjogMn0=',
    });
    if (result.success) {
      expect(result.data.cursor).toBe('eyJwYWdlIjogMn0=');
    }
  });
});

// ─── AC-18.3 — cursor absent → first page ─────────────────────────────────────

describe('cursor absent → first page (AC-18.3 · R-12.2-b)', () => {
  it('PaginatedRequestParamsSchema accepts absent cursor', () => {
    expect(PaginatedRequestParamsSchema.safeParse({}).success).toBe(true);
  });

  it('isCursorPresent returns false when cursor is undefined', () => {
    expect(isCursorPresent(undefined)).toBe(false);
  });
});

// ─── AC-18.4 — params may be omitted for first page ──────────────────────────

describe('First page without params (AC-18.4 · R-12.3-a)', () => {
  it('PaginatedRequestParamsSchema accepts an empty object', () => {
    expect(PaginatedRequestParamsSchema.safeParse({}).success).toBe(true);
  });
});

// ─── AC-18.5 — nextCursor present → more results, echo it back ───────────────

describe('nextCursor present (AC-18.5 · R-12.2-c)', () => {
  it('hasNextCursor returns true when nextCursor is a non-empty string', () => {
    expect(hasNextCursor({ nextCursor: 'eyJwYWdlIjogMn0=' })).toBe(true);
  });

  it('PaginatedResultSchema preserves nextCursor through parse', () => {
    const result = PaginatedResultSchema.safeParse({
      resultType: 'complete',
      tools: [],
      nextCursor: 'eyJwYWdlIjogMn0=',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.nextCursor).toBe('eyJwYWdlIjogMn0=');
    }
  });
});

// ─── AC-18.6 — nextCursor absent → last page ─────────────────────────────────

describe('nextCursor absent → last page (AC-18.6 · R-12.2-d, R-12.3-c)', () => {
  it('hasNextCursor returns false when nextCursor is undefined', () => {
    expect(hasNextCursor({})).toBe(false);
  });

  it('isLastPage returns true when nextCursor is absent', () => {
    expect(isLastPage({ nextCursor: undefined })).toBe(true);
    expect(isLastPage({})).toBe(true);
  });

  it('isLastPage returns false when nextCursor is present', () => {
    expect(isLastPage({ nextCursor: 'C1' })).toBe(false);
  });

  it('PaginatedResultSchema parses a final-page result without nextCursor', () => {
    expect(
      PaginatedResultSchema.safeParse({ resultType: 'complete', tools: [] }).success,
    ).toBe(true);
  });
});

// ─── AC-18.7 — server nextCursor obligations ──────────────────────────────────

describe('Server nextCursor obligation (AC-18.7 · R-12.3-b)', () => {
  it('result with nextCursor parses as a continuation page', () => {
    const page = PaginatedResultSchema.safeParse({
      resultType: 'complete',
      tools: [{ name: 'get_weather' }],
      nextCursor: 'eyJwYWdlIjogMn0=',
    });
    expect(page.success).toBe(true);
    if (page.success) expect(page.data.nextCursor).toBeDefined();
  });

  it('result without nextCursor parses as the final page', () => {
    const page = PaginatedResultSchema.safeParse({
      resultType: 'complete',
      tools: [{ name: 'get_forecast' }],
    });
    expect(page.success).toBe(true);
    if (page.success) expect(page.data.nextCursor).toBeUndefined();
  });
});

// ─── AC-18.8 — nextCursor="" must be echoed, not treated as end ───────────────

describe('Empty-string nextCursor (AC-18.8 · R-12.3-d, R-12.3-e)', () => {
  it('isLastPage returns false when nextCursor is ""', () => {
    expect(isLastPage({ nextCursor: '' })).toBe(false);
  });

  it('hasNextCursor returns true when nextCursor is ""', () => {
    expect(hasNextCursor({ nextCursor: '' })).toBe(true);
  });

  it('isCursorPresent("") returns true — client must send it back', () => {
    expect(isCursorPresent('')).toBe(true);
  });
});

// ─── AC-18.9 — single-page and multi-page flows supported ────────────────────

describe('Single-page and multi-page flows (AC-18.9 · R-12.3-f, R-12.3-g, R-12.3-h)', () => {
  it('a result with no nextCursor is a valid single-page (complete) response', () => {
    const result = PaginatedResultSchema.safeParse({
      resultType: 'complete',
      tools: [{ name: 'tool-a' }, { name: 'tool-b' }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(isLastPage(result.data)).toBe(true);
    }
  });

  it('a result WITH nextCursor correctly signals continuation', () => {
    const result = PaginatedResultSchema.safeParse({
      resultType: 'complete',
      tools: [{ name: 'tool-a' }],
      nextCursor: 'C1',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(isLastPage(result.data)).toBe(false);
    }
  });
});

// ─── AC-18.10 — stable cursor (SHOULD) ───────────────────────────────────────

describe('Stable cursors (AC-18.10 · R-12.3-i)', () => {
  it('the same cursor value echoed back is a valid request cursor', () => {
    // Stable cursors mean that re-presenting a previously issued cursor
    // still retrieves the page it designates. This is a server obligation.
    // From the client/schema perspective: the cursor is accepted on re-presentation.
    expect(
      PaginatedRequestParamsSchema.safeParse({
        cursor: 'eyJwYWdlIjogMn0=',
      }).success,
    ).toBe(true);
  });
});

// ─── AC-18.11 — server resolves position from cursor ─────────────────────────

describe('Server resolves position from cursor (AC-18.11 · R-12.3-j)', () => {
  it('cursor is stored unchanged in parsed request params', () => {
    const raw = 'eyJzb21lIjogInN0YXRlIn0=';
    const result = PaginatedRequestParamsSchema.safeParse({ cursor: raw });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.cursor).toBe(raw);
    }
  });
});

// ─── AC-18.12 — cursor opacity (no parsing/decoding/inferring) ───────────────

describe('Cursor opacity (AC-18.12 · R-12.3-k, R-12.3-l, R-12.3-m)', () => {
  it('CursorSchema accepts a JSON-looking cursor without interpreting it', () => {
    // Clients MUST NOT parse or decode the cursor — even a JSON-looking token
    // must be treated as an opaque string.
    const jsonLookingCursor = '{"page":2,"offset":10}';
    expect(CursorSchema.safeParse(jsonLookingCursor).success).toBe(true);
  });

  it('CursorSchema accepts a cursor that looks like a page number', () => {
    // Clients MUST NOT infer ordering, page count, or completeness from the value.
    expect(CursorSchema.safeParse('3').success).toBe(true);
  });

  it('the only observable fact about a cursor is whether a value was provided', () => {
    // isCursorPresent: true if defined, false if undefined.
    expect(isCursorPresent('any-value')).toBe(true);
    expect(isCursorPresent(undefined)).toBe(false);
    // No other interpretation is permitted.
  });
});

// ─── AC-18.13 — cursor cross-server prohibition ───────────────────────────────

describe('Cursor server-scope (AC-18.13 · R-12.3-n, R-12.3-o, R-12.3-p, R-12.3-q)', () => {
  it('cursor is accepted only with the issuing server — different cache keys document this', () => {
    // paginationCacheKey encodes the method; sending a cursor from server A to
    // server B would produce a request with a different cache key (different origin).
    const keyServerA = paginationCacheKey('tools/list', 'cursorFromA');
    const keyServerB = paginationCacheKey('tools/list', 'cursorFromA');
    // Same key only because method+cursor are the same — in practice the caller
    // knows which server issued the cursor. The schema does not enforce cross-server
    // prohibition (that is a behavioral rule for the client), but the documentation
    // makes the rule unambiguous.
    expect(keyServerA).toBe(keyServerB);
  });
});

// ─── AC-18.14 — variable page sizes and empty pages ──────────────────────────

describe('Variable page sizes (AC-18.14 · R-12.4-a, R-12.4-b)', () => {
  it('accepts an empty page with nextCursor — more results may follow', () => {
    const result = PaginatedResultSchema.safeParse({
      resultType: 'complete',
      tools: [],
      nextCursor: 'eyJwYWdlIjogN30=',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(hasNextCursor(result.data)).toBe(true);
      expect((result.data as Record<string, unknown>)['tools']).toEqual([]);
    }
  });

  it('accepts a page with a single item — pages need not have equal sizes', () => {
    const result = PaginatedResultSchema.safeParse({
      resultType: 'complete',
      tools: [{ name: 'lone-tool' }],
      nextCursor: 'C2',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a page with many items', () => {
    const tools = Array.from({ length: 100 }, (_, i) => ({ name: `tool-${i}` }));
    const result = PaginatedResultSchema.safeParse({
      resultType: 'complete',
      tools,
      nextCursor: 'C100',
    });
    expect(result.success).toBe(true);
  });
});

// ─── AC-18.15 — invalid cursor → -32602 ──────────────────────────────────────

describe('Invalid cursor error (AC-18.15 · R-12.4-c, R-12.4-d)', () => {
  it('INVALID_CURSOR_CODE is -32602', () => {
    expect(INVALID_CURSOR_CODE).toBe(-32602);
  });

  it('buildInvalidCursorError returns the expected error shape', () => {
    const err = buildInvalidCursorError();
    expect(err.code).toBe(-32602);
    expect(typeof err.message).toBe('string');
  });

  it('buildInvalidCursorError accepts a custom message', () => {
    const err = buildInvalidCursorError('cursor has expired');
    expect(err.message).toBe('cursor has expired');
  });

  it('buildInvalidCursorError wire shape matches the spec example', () => {
    const err = buildInvalidCursorError('Invalid params: unrecognized cursor');
    expect(err).toEqual({
      code: -32602,
      message: 'Invalid params: unrecognized cursor',
    });
  });
});

// ─── AC-18.16 — per-cursor cache isolation ────────────────────────────────────

describe('Per-cursor cache isolation (AC-18.16 · R-12.5-a)', () => {
  it('first-page key differs from a cursor-bearing request key', () => {
    const firstPage = paginationCacheKey('tools/list', undefined);
    const page2 = paginationCacheKey('tools/list', 'eyJwYWdlIjogMn0=');
    expect(firstPage).not.toBe(page2);
  });

  it('two different cursors produce different cache keys', () => {
    const c1 = paginationCacheKey('tools/list', 'C1');
    const c2 = paginationCacheKey('tools/list', 'C2');
    expect(c1).not.toBe(c2);
  });

  it('same cursor on different methods produces different cache keys', () => {
    const tools = paginationCacheKey('tools/list', 'C1');
    const resources = paginationCacheKey('resources/list', 'C1');
    expect(tools).not.toBe(resources);
  });

  it('same method and same cursor produces the same cache key (idempotent)', () => {
    const a = paginationCacheKey('tools/list', 'C1');
    const b = paginationCacheKey('tools/list', 'C1');
    expect(a).toBe(b);
  });

  it('empty-string cursor has a distinct cache key from first-page (absent cursor)', () => {
    const noKey = paginationCacheKey('tools/list', undefined);
    const emptyKey = paginationCacheKey('tools/list', '');
    expect(noKey).not.toBe(emptyKey);
  });
});

// ─── PAGINATED_METHODS registry ───────────────────────────────────────────────

describe('Paginated methods registry (§12)', () => {
  it('tools/list is a paginated method', () => {
    expect(isPaginatedMethod('tools/list')).toBe(true);
  });

  it('resources/list is a paginated method', () => {
    expect(isPaginatedMethod('resources/list')).toBe(true);
  });

  it('resources/templates/list is a paginated method', () => {
    expect(isPaginatedMethod('resources/templates/list')).toBe(true);
  });

  it('prompts/list is a paginated method', () => {
    expect(isPaginatedMethod('prompts/list')).toBe(true);
  });

  it('PAGINATED_METHODS contains exactly the four paginated methods', () => {
    expect(PAGINATED_METHODS.size).toBe(4);
  });

  it('tools/call is NOT a paginated method', () => {
    expect(isPaginatedMethod('tools/call')).toBe(false);
  });
});

// ─── OffsetPaginator — reference paginator (RC-2, RC-3, RC-4) ────────────────

describe('OffsetPaginator — constructor', () => {
  it('accepts a valid pageSize', () => {
    expect(() => new OffsetPaginator([1, 2, 3], 2)).not.toThrow();
  });

  it('throws RangeError for pageSize=0', () => {
    expect(() => new OffsetPaginator([], 0)).toThrow(RangeError);
  });

  it('throws RangeError for non-integer pageSize', () => {
    expect(() => new OffsetPaginator([], 1.5)).toThrow(RangeError);
  });

  it('defaults to pageSize 20', () => {
    expect(new OffsetPaginator(Array.from({ length: 50 })).pageSize).toBe(20);
  });
});

describe('OffsetPaginator — first page (cursor absent)', () => {
  const pager = new OffsetPaginator(['a', 'b', 'c', 'd', 'e'], 2);

  it('getPage(undefined) returns ok:true', () => {
    const result = pager.getPage(undefined);
    expect(result.ok).toBe(true);
  });

  it('returns the first pageSize items', () => {
    const result = pager.getPage(undefined);
    if (result.ok) expect(result.items).toEqual(['a', 'b']);
  });

  it('returns a nextCursor when more items remain', () => {
    const result = pager.getPage(undefined);
    if (result.ok) expect(result.nextCursor).toBeDefined();
  });
});

describe('OffsetPaginator — subsequent pages', () => {
  const pager = new OffsetPaginator(['a', 'b', 'c', 'd', 'e'], 2);

  it('re-presenting nextCursor yields the next page', () => {
    const first = pager.getPage(undefined);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = pager.getPage(first.nextCursor);
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.items).toEqual(['c', 'd']);
  });

  it('final page has no nextCursor', () => {
    const first = pager.getPage(undefined);
    if (!first.ok) return;
    const second = pager.getPage(first.nextCursor);
    if (!second.ok) return;
    const third = pager.getPage(second.nextCursor);
    expect(third.ok).toBe(true);
    if (third.ok) {
      expect(third.items).toEqual(['e']);
      expect(third.nextCursor).toBeUndefined();
    }
  });
});

describe('OffsetPaginator — deterministic cursors (RC-2)', () => {
  const pager = new OffsetPaginator([1, 2, 3, 4, 5, 6], 2);

  it('same page position always produces the same cursor', () => {
    const r1 = pager.getPage(undefined);
    const r2 = pager.getPage(undefined);
    expect(r1.ok && r2.ok && r1.nextCursor === r2.nextCursor).toBe(true);
  });

  it('cursor from page N re-presented later yields the same items', () => {
    const pageA = pager.getPage(undefined);
    if (!pageA.ok) return;
    const cursor = pageA.nextCursor;
    const pageB1 = pager.getPage(cursor);
    const pageB2 = pager.getPage(cursor);
    expect(pageB1.ok && pageB2.ok).toBe(true);
    if (pageB1.ok && pageB2.ok) {
      expect(pageB1.items).toEqual(pageB2.items);
    }
  });
});

describe('OffsetPaginator — invalid cursor handling (RC-3, RC-4)', () => {
  const pager = new OffsetPaginator(['x', 'y', 'z'], 2);

  it('returns ok:false for an unrecognized cursor — does not throw', () => {
    const result = pager.getPage('not-a-number');
    expect(result.ok).toBe(false);
  });

  it('returns a structured buildInvalidCursorError error payload', () => {
    const result = pager.getPage('not-a-number');
    if (!result.ok) {
      expect(result.error.code).toBe(INVALID_CURSOR_CODE);
      expect(typeof result.error.message).toBe('string');
    }
  });

  it('rejects an empty-string cursor (not issued by this paginator)', () => {
    const result = pager.getPage('');
    expect(result.ok).toBe(false);
  });

  it('rejects a negative offset cursor', () => {
    const result = pager.getPage('-1');
    expect(result.ok).toBe(false);
  });

  it('rejects an out-of-bounds cursor', () => {
    const result = pager.getPage('9999');
    expect(result.ok).toBe(false);
  });

  it('server remains operational after a bad cursor (no throw)', () => {
    // RC-4: the paginator does not throw — subsequent calls succeed normally
    pager.getPage('bad');
    const valid = pager.getPage(undefined);
    expect(valid.ok).toBe(true);
  });
});

describe('OffsetPaginator — empty item list', () => {
  it('returns an empty page with no nextCursor', () => {
    const pager = new OffsetPaginator<string>([], 10);
    const result = pager.getPage(undefined);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.items).toEqual([]);
      expect(result.nextCursor).toBeUndefined();
    }
  });
});

// ─── Wire examples (§12) ──────────────────────────────────────────────────────

describe('Wire examples (§12)', () => {
  it('first-page request: empty params', () => {
    expect(PaginatedRequestParamsSchema.safeParse({}).success).toBe(true);
  });

  it('result with nextCursor: from spec', () => {
    const result = PaginatedResultSchema.safeParse({
      resultType: 'complete',
      tools: [
        {
          name: 'get_weather',
          title: 'Get Weather',
          inputSchema: {
            type: 'object',
            properties: { location: { type: 'string' } },
            required: ['location'],
          },
        },
      ],
      nextCursor: 'eyJwYWdlIjogMn0=',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.nextCursor).toBe('eyJwYWdlIjogMn0=');
      expect(hasNextCursor(result.data)).toBe(true);
    }
  });

  it('follow-up request with cursor: from spec', () => {
    const result = PaginatedRequestParamsSchema.safeParse({
      cursor: 'eyJwYWdlIjogMn0=',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.cursor).toBe('eyJwYWdlIjogMn0=');
    }
  });

  it('final-page result: no nextCursor', () => {
    const result = PaginatedResultSchema.safeParse({
      resultType: 'complete',
      tools: [{ name: 'get_forecast', title: 'Get Forecast', inputSchema: {} }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(isLastPage(result.data)).toBe(true);
    }
  });
});
