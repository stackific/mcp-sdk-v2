[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / verifyRedirectState

# Function: verifyRedirectState()

> **verifyRedirectState**(`sentState`, `returnedState`): [`StateValidationResult`](../type-aliases/StateValidationResult.md)

Defined in: [protocol/authorization-flow.ts:1092](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L1092)

Verifies the redirect `state` against the value sent in Step 1, the check a
client MUST pass before redeeming the code. (R-23.5-h, R-23.5-l)

When a `state` was sent, the returned `state` MUST be present and equal it
(exact string match). When no `state` was sent, a returned `state` is ignored.

## Parameters

### sentState

`string` \| `undefined`

The `state` sent in the authorization request, or `undefined`.

### returnedState

`string` \| `undefined`

The `state` echoed on the redirect, or `undefined`.

## Returns

[`StateValidationResult`](../type-aliases/StateValidationResult.md)
