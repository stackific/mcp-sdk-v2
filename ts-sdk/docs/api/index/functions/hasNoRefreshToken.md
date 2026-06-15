[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / hasNoRefreshToken

# Function: hasNoRefreshToken()

> **hasNoRefreshToken**(`token`): `boolean`

Defined in: [protocol/authorization-flow.ts:1406](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L1406)

Returns `true` when a token response did NOT issue a refresh token, so callers
never assume one was issued. (R-23.9-d)

## Parameters

### token

`Pick`\<[`TokenResponse`](../type-aliases/TokenResponse.md), `"refresh_token"`\>

A parsed token response.

## Returns

`boolean`
