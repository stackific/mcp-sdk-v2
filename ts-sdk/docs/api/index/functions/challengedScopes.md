[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / challengedScopes

# Function: challengedScopes()

> **challengedScopes**(`challenge`): `string`[]

Defined in: [protocol/authorization.ts:555](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization.ts#L555)

Resolves the scopes a client MUST treat as required for the request from a
challenge. (R-23.1-x, R-23.1-y)

The challenged scope set is authoritative: a client MUST treat it as the
scopes required to satisfy the request (R-23.1-x) and MUST NOT assume any
subset/superset relationship between it and `scopes_supported` from
protected-resource metadata (R-23.1-y). This therefore derives the required
scopes solely from the challenge's `scope` parameter, never from
`scopes_supported`. Returns `[]` when the challenge carried no `scope`.

## Parameters

### challenge

[`WwwAuthenticateChallenge`](../interfaces/WwwAuthenticateChallenge.md)

A parsed `WWW-Authenticate` challenge.

## Returns

`string`[]
