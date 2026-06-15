[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isSessionIdHeader

# Function: isSessionIdHeader()

> **isSessionIdHeader**(`name`): `boolean`

Defined in: [transport/http/responses.ts:458](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/responses.ts#L458)

Returns `true` when `name` is a session-identifier header this transport MUST
NOT use; the server MUST ignore any such header a client sends. (R-9.9-b,
R-9.9-c, R-9.9-d) Comparison is case-insensitive.

## Parameters

### name

`string`

## Returns

`boolean`
