[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / checkHttpRevisionHeader

# Function: checkHttpRevisionHeader()

> **checkHttpRevisionHeader**(`header`, `metaVersion`): [`HttpRevisionCheckResult`](../type-aliases/HttpRevisionCheckResult.md)

Defined in: [protocol/revision.ts:75](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/revision.ts#L75)

Validates that the `MCP-Protocol-Version` HTTP header byte-for-byte matches
the `io.modelcontextprotocol/protocolVersion` value in the request's `_meta`.

Returns `{ ok: true }` when the values match or when `header` is `undefined`
(non-HTTP transport — no header to check).

Returns `{ ok: false, status: 400, message }` when the header is present but
does not equal `metaVersion`, indicating the server MUST respond with
HTTP 400 Bad Request. (R-5.2-d, R-5.2-e)

## Parameters

### header

`string` \| `undefined`

The value of the `MCP-Protocol-Version` HTTP header, or
                     `undefined` when operating on a non-HTTP transport.

### metaVersion

`string`

The `io.modelcontextprotocol/protocolVersion` string from
                     the request's `params._meta`.

## Returns

[`HttpRevisionCheckResult`](../type-aliases/HttpRevisionCheckResult.md)
