[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / interpretPostForFallback

# Function: interpretPostForFallback()

> **interpretPostForFallback**(`status`, `body`): [`PostFallbackDecision`](../type-aliases/PostFallbackDecision.md)

Defined in: [transport/http/responses.ts:605](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/responses.ts#L605)

Interprets the outcome of a modern POST for a client that also supports an
earlier `initialize`-handshake revision. (R-9.12-a, R-9.12-b, R-9.12-c,
R-9.12-d, R-9.12-e, R-9.12-g)

On a `400`, the client SHOULD inspect the body before falling back, because a
modern server returns `400` for `-32004`/`-32003`/`-32001`. A recognized
revision error means retry, never fall back. An empty/unrecognized body on a
`400`/`404`/`405` means the client SHOULD probe for the legacy transport.

## Parameters

### status

`number`

The HTTP status the POST returned.

### body

`unknown`

The parsed response body (or `undefined`/`null` if empty).

## Returns

[`PostFallbackDecision`](../type-aliases/PostFallbackDecision.md)
