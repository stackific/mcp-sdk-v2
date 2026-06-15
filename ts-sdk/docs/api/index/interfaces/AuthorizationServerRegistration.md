[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / AuthorizationServerRegistration

# Interface: AuthorizationServerRegistration

Defined in: [protocol/authorization.ts:136](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization.ts#L136)

Registration state held for a single authorization server, keyed by its
`issuer`. A client MUST store this separately per authorization server
(R-23.1-i); credentials registered with one server MUST NOT be assumed valid
at another (R-23.1-j). The concrete `client_id`/token fields are filled in by
S36/S37 — this story only owns the per-`issuer` isolation contract.

## Properties

### issuer

> **issuer**: `string`

Defined in: [protocol/authorization.ts:138](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization.ts#L138)

The authorization server's `issuer` identifier URL; the isolation key.

***

### clientId?

> `optional` **clientId?**: `string`

Defined in: [protocol/authorization.ts:140](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization.ts#L140)

OPTIONAL registered client identifier (populated by S36/S37).

***

### accessToken?

> `optional` **accessToken?**: `string`

Defined in: [protocol/authorization.ts:142](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization.ts#L142)

OPTIONAL issued access token (populated by S36).

***

### refreshToken?

> `optional` **refreshToken?**: `string`

Defined in: [protocol/authorization.ts:144](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization.ts#L144)

OPTIONAL issued refresh token (populated by S36).
