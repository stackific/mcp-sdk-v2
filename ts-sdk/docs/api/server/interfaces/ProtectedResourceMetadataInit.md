[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [server](../README.md) / ProtectedResourceMetadataInit

# Interface: ProtectedResourceMetadataInit

Defined in: server/auth.ts:23

Inputs to [buildProtectedResourceMetadata](../functions/buildProtectedResourceMetadata.md).

## Properties

### resource

> **resource**: `string`

Defined in: server/auth.ts:25

The canonical resource identifier (the MCP endpoint URL).

***

### authorizationServers

> **authorizationServers**: `string`[]

Defined in: server/auth.ts:27

The authorization server issuer URLs that protect this resource.

***

### scopes?

> `optional` **scopes?**: `string`[]

Defined in: server/auth.ts:29

OPTIONAL scopes the resource recognizes.

***

### bearerMethods?

> `optional` **bearerMethods?**: `string`[]

Defined in: server/auth.ts:31

OPTIONAL supported bearer-token delivery methods (default `['header']`).
