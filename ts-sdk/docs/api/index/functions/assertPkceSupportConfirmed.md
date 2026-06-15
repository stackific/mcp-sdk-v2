[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / assertPkceSupportConfirmed

# Function: assertPkceSupportConfirmed()

> **assertPkceSupportConfirmed**(`metadata`): `void`

Defined in: [protocol/authorization-flow.ts:838](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L838)

Asserts PKCE `S256` support is confirmable from AS metadata, throwing
[PkceSupportError](../classes/PkceSupportError.md) when it is not — so the client refuses to proceed
rather than starting an authorization flow against an AS that may not support
PKCE. (§28.5, R-28.5-k)

## Parameters

### metadata

`Pick`\<[`AuthorizationServerMetadata`](../type-aliases/AuthorizationServerMetadata.md), `"code_challenge_methods_supported"`\>

## Returns

`void`
