[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / validateOrigin

# Function: validateOrigin()

> **validateOrigin**(`origin`, `acceptedOrigins`): \{ `accepted`: `true`; \} \| \{ `accepted`: `false`; `origin`: `string`; \}

Defined in: [transport/http/responses.ts:525](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/responses.ts#L525)

Validates the `Origin` header against the server's accepted-origin set,
defending against DNS-rebinding. (R-9.11-a, R-9.11-b)

When the `Origin` header is *present and not accepted*, the request MUST be
rejected (`accepted: false`). When `Origin` is absent or in the accepted set,
it passes. Matching is exact against the configured origins.

## Parameters

### origin

`string` \| `undefined`

The request's `Origin` header value, or `undefined`.

### acceptedOrigins

`Iterable`\<`string`\>

The origins the server is configured to accept.

## Returns

\{ `accepted`: `true`; \} \| \{ `accepted`: `false`; `origin`: `string`; \}
