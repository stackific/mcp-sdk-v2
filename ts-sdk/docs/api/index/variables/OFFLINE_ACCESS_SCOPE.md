[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / OFFLINE\_ACCESS\_SCOPE

# Variable: OFFLINE\_ACCESS\_SCOPE

> `const` **OFFLINE\_ACCESS\_SCOPE**: `"offline_access"`

Defined in: [protocol/authorization-flow.ts:91](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L91)

The reserved scope a client adds to request a refresh token, when (and only
when) the authorization-server metadata advertises it. (R-23.9-b)

An MCP server SHOULD NOT advertise this in its `WWW-Authenticate` `scope` or in
protected-resource-metadata `scopes_supported` — see
[advertisedScopesExcludeOfflineAccess](../functions/advertisedScopesExcludeOfflineAccess.md). (R-23.9-g)
