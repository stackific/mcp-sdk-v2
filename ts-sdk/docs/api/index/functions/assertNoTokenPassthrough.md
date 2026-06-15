[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / assertNoTokenPassthrough

# Function: assertNoTokenPassthrough()

> **assertNoTokenPassthrough**(`options`): [`TokenPassthroughValidation`](../type-aliases/TokenPassthroughValidation.md)

Defined in: [protocol/security.ts:822](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L822)

Asserts the no-token-passthrough / confused-deputy rule: a server never accepts a
token issued for another resource and never forwards a client token onward to an
upstream API; when it calls upstream it uses a SEPARATE token from the upstream
AS. (§28.5, R-28.5-f, R-28.5-g; AC-44.13)

Returns `ok: false` when the token intended for the upstream call is the same one
the client presented (`clientPresentedToken === upstreamToken`) — the
confused-deputy vulnerability — or when the upstream token was not issued by the
upstream authorization server. Reuses S37's [mayForwardTokenToServer](mayForwardTokenToServer.md) to
confirm the upstream token's issuer matches the upstream AS.

## Parameters

### options

#### clientPresentedToken

`string`

The bearer token the client presented to this server.

#### upstreamToken

`string`

The token this server intends to send upstream.

#### upstreamTokenIssuer

`string`

The issuer that minted the upstream token.

#### upstreamAuthorizationServerIssuer

`string`

The upstream API's authorization server issuer.

## Returns

[`TokenPassthroughValidation`](../type-aliases/TokenPassthroughValidation.md)
