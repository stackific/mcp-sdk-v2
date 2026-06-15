[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / deriveCodeChallenge

# Function: deriveCodeChallenge()

> **deriveCodeChallenge**(`codeVerifier`): `string`

Defined in: [protocol/authorization-flow.ts:166](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L166)

Derives the `S256` `code_challenge` from a `code_verifier`:
`BASE64URL(SHA-256(code_verifier))`. (R-23.5-b)

## Parameters

### codeVerifier

`string`

A valid PKCE `code_verifier`.

## Returns

`string`

## Throws

When `codeVerifier` is not a valid PKCE verifier.
