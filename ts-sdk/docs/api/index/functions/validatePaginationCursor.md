[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / validatePaginationCursor

# Function: validatePaginationCursor()

> **validatePaginationCursor**(`cursor`, `options`): [`CursorValidation`](../type-aliases/CursorValidation.md) \| \{ `ok`: `true`; `cursor`: `undefined`; \}

Defined in: [protocol/security.ts:1453](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L1453)

Validates a pagination cursor as opaque, untrusted input: it is rejected with a
`-32602` error when malformed, unknown, or expired, rather than having its
attacker-controlled contents interpreted. (§28.10, R-28.10-j; AC-44.27)

A server MUST treat a cursor as opaque and MUST NOT decode and act on its
contents. The `isKnown` predicate is the server's own recognition check (e.g.
"did I mint this cursor and is it unexpired?"); a non-string or unrecognized
cursor yields S18's [buildInvalidCursorError](buildInvalidCursorError.md) (`-32602`). An absent cursor
is valid — it requests the first page.

## Parameters

### cursor

`string` \| `undefined`

The cursor the client supplied, or `undefined` for the first page.

### options

#### isKnown

(`cursor`) => `boolean`

## Returns

[`CursorValidation`](../type-aliases/CursorValidation.md) \| \{ `ok`: `true`; `cursor`: `undefined`; \}
