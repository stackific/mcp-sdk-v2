[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / PkceChallenge

# Interface: PkceChallenge

Defined in: [protocol/authorization-flow.ts:108](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L108)

A generated PKCE pair: the secret verifier and its derived public challenge.

## Properties

### codeVerifier

> **codeVerifier**: `string`

Defined in: [protocol/authorization-flow.ts:110](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L110)

The high-entropy secret; 43–128 unreserved chars. (R-23.5-b)

***

### codeChallenge

> **codeChallenge**: `string`

Defined in: [protocol/authorization-flow.ts:112](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L112)

`BASE64URL(SHA-256(codeVerifier))`. (R-23.5-b)

***

### codeChallengeMethod

> **codeChallengeMethod**: `"S256"`

Defined in: [protocol/authorization-flow.ts:114](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L114)

Always `S256` for MCP. (R-23.5-a, R-23.5-i)
