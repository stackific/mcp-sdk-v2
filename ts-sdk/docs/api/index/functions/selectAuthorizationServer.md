[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / selectAuthorizationServer

# Function: selectAuthorizationServer()

> **selectAuthorizationServer**(`metadata`, `prefer?`): `string` \| `undefined`

Defined in: [protocol/authorization.ts:650](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization.ts#L650)

Selects one authorization-server `issuer` from a protected-resource metadata
document. (R-23.2-j)

Each listed authorization server is independent and selecting which to use is
the client's responsibility. By default this picks the first listed issuer; a
`prefer` callback lets a caller impose its own selection policy (the first
issuer for which `prefer` returns `true` wins, falling back to the first
listed issuer when none matches). Returns `undefined` only for an empty list
(which a valid document never has — R-23.2-i).

## Parameters

### metadata

`Pick`\<[`ProtectedResourceMetadata`](../type-aliases/ProtectedResourceMetadata.md), `"authorization_servers"`\>

A validated protected-resource metadata document.

### prefer?

(`issuer`) => `boolean`

OPTIONAL predicate selecting a preferred issuer.

## Returns

`string` \| `undefined`
