[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / refreshTokenIsNeverAssumed

# Function: refreshTokenIsNeverAssumed()

> **refreshTokenIsNeverAssumed**(): `boolean`

Defined in: [protocol/authorization-registration.ts:1233](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L1233)

Returns `true` — a client MUST NOT assume a refresh token will be issued; the
authorization server retains discretion. (R-23.19-t)

A guard for control flow: treat the refresh token as optional and handle its
absence. Pair with S36's `hasNoRefreshToken` to detect a token response that did
not issue one.

## Returns

`boolean`
