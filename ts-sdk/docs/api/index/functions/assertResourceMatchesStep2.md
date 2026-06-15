[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / assertResourceMatchesStep2

# Function: assertResourceMatchesStep2()

> **assertResourceMatchesStep2**(`request`, `step2Resource`): \{ `ok`: `true`; \} \| \{ `ok`: `false`; `reason`: `string`; \}

Defined in: [protocol/authorization-flow.ts:1326](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L1326)

Asserts that a token request's `resource` is byte-identical to the value sent in
Step 2, the audience-binding invariant. (R-23.5-p, R-23.9-e)

## Parameters

### request

`Pick`\<[`TokenRequest`](../type-aliases/TokenRequest.md), `"resource"`\>

The token request (either grant).

### step2Resource

`string`

The `resource` sent in the Step-2 authorization request.

## Returns

\{ `ok`: `true`; \} \| \{ `ok`: `false`; `reason`: `string`; \}
