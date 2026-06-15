[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isValidCodeVerifier

# Function: isValidCodeVerifier()

> **isValidCodeVerifier**(`verifier`): `boolean`

Defined in: [protocol/authorization-flow.ts:128](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L128)

Returns `true` when `verifier` is a valid PKCE `code_verifier`: 43–128
characters drawn solely from the unreserved alphabet. (R-23.5-b)

## Parameters

### verifier

`string`

The candidate `code_verifier`.

## Returns

`boolean`
