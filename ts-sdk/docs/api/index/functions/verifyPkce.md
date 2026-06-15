[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / verifyPkce

# Function: verifyPkce()

> **verifyPkce**(`codeVerifier`, `codeChallenge`): `boolean`

Defined in: [protocol/authorization-flow.ts:200](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L200)

Verifies that a presented `code_verifier` matches a previously issued
`code_challenge` under the `S256` method — the check an authorization server's
token endpoint performs. (R-23.5-b)

## Parameters

### codeVerifier

`string`

The verifier presented in the token request.

### codeChallenge

`string`

The challenge sent in the authorization request.

## Returns

`boolean`
