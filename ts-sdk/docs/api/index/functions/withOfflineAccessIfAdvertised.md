[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / withOfflineAccessIfAdvertised

# Function: withOfflineAccessIfAdvertised()

> **withOfflineAccessIfAdvertised**(`scopes`, `authorizationServerMeta`): `string`[]

Defined in: [protocol/authorization-registration.ts:1213](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L1213)

Adds `offline_access` to a `scope` string when, and only when, the
authorization-server metadata advertises it in `scopes_supported`, for a client
that wants a refresh token. (R-23.19-s)

A client MAY add `offline_access` only when the AS lists it; when it is not
advertised the scope is returned unchanged. The result is deduplicated. Mirrors
S36's `withOfflineAccessScope` behaviour under the §23.19 refresh atom; provided
as a list-shaped helper for the scope-list call sites in this story.

## Parameters

### scopes

readonly `string`[]

The current scope list.

### authorizationServerMeta

`Pick`\<[`AuthorizationServerMetadata`](../type-aliases/AuthorizationServerMetadata.md), `"scopes_supported"`\>

The selected authorization server's metadata.

## Returns

`string`[]
