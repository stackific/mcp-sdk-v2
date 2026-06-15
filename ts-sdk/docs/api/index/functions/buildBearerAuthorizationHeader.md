[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildBearerAuthorizationHeader

# Function: buildBearerAuthorizationHeader()

> **buildBearerAuthorizationHeader**(`accessToken`): `string`

Defined in: [protocol/authorization-flow.ts:1510](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L1510)

Builds the `Authorization: Bearer <access-token>` request header value a client
MUST send on every request to the MCP server. (R-23.8-a, R-23.8-b)

## Parameters

### accessToken

`string`

The bearer access token.

## Returns

`string`

## Throws

When `accessToken` is empty.
