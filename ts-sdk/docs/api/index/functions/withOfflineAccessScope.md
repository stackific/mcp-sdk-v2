[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / withOfflineAccessScope

# Function: withOfflineAccessScope()

> **withOfflineAccessScope**(`scope`, `authorizationServerMeta`): `string` \| `undefined`

Defined in: [protocol/authorization-flow.ts:720](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L720)

Adds `offline_access` to a `scope` string when, and only when, the
authorization-server metadata advertises it in `scopes_supported`. (R-23.9-b)

Returns the scope unchanged (possibly `undefined`) when `offline_access` is not
advertised, or already present. When `scope` is `undefined` but `offline_access`
is advertised, returns just `offline_access`.

## Parameters

### scope

`string` \| `undefined`

The current `scope` string, or `undefined`.

### authorizationServerMeta

`Pick`\<[`AuthorizationServerMetadata`](../type-aliases/AuthorizationServerMetadata.md), `"scopes_supported"`\>

The selected authorization server's metadata.

## Returns

`string` \| `undefined`
