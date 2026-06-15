[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [client](../README.md) / assertPkceSupported

# Function: assertPkceSupported()

> **assertPkceSupported**(`metadata`): `void`

Defined in: client/oauth.ts:47

Confirms the AS advertises PKCE `S256`; throws otherwise (the client MUST refuse). (§28.5, R-28.5-k)

## Parameters

### metadata

`Pick`\<[`AuthorizationServerMetadata`](../../index/type-aliases/AuthorizationServerMetadata.md), `"code_challenge_methods_supported"`\>

## Returns

`void`
