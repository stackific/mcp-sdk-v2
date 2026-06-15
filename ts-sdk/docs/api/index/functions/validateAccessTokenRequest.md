[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / validateAccessTokenRequest

# Function: validateAccessTokenRequest()

> **validateAccessTokenRequest**(`token`, `context`): [`AccessTokenValidation`](../type-aliases/AccessTokenValidation.md)

Defined in: [protocol/authorization-flow.ts:1600](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L1600)

Validates a presented access token on the MCP server side, on EVERY request,
yielding a `401`/`403` challenge on failure. (R-23.8-a, R-23.8-d, R-23.8-e,
R-23.8-f)

The server treats each request independently and revalidates the token each time
(R-23.8-a). The checks, in order:
  - missing / inactive / expired token → `401 Unauthorized` (R-23.8-e);
  - wrong audience → `401 Unauthorized` (the token was not issued for this
    server; R-23.6-f/g, R-23.8-d/e);
  - valid token lacking a required scope → `403 Forbidden` with an
    `insufficient_scope` challenge (R-23.8-f).

The `401`/`403` challenges are built with S35's `buildUnauthorizedResponse` /
`buildInsufficientScopeResponse`.

## Parameters

### token

[`PresentedToken`](../interfaces/PresentedToken.md) \| `undefined`

The presented token's validated facts, or `undefined` when absent.

### context

[`TokenValidationContext`](../interfaces/TokenValidationContext.md)

What this operation requires.

## Returns

[`AccessTokenValidation`](../type-aliases/AccessTokenValidation.md)
