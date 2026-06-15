[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / resolveProtectedResourceMetadataUris

# Function: resolveProtectedResourceMetadataUris()

> **resolveProtectedResourceMetadataUris**(`options`): `string`[]

Defined in: [protocol/authorization.ts:710](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization.ts#L710)

Resolves where to fetch protected-resource metadata from, honoring discovery
precedence. (R-23.2-c, R-23.2-d, R-23.2-e, R-23.2-g)

  - When the `401`'s `WWW-Authenticate` header carried `resource_metadata`, the
    client MUST use that URI — it is returned as the single entry (R-23.2-d).
  - Otherwise the ordered well-known URIs are returned for the client to try in
    order, using the first that yields a valid document (R-23.2-e, R-23.2-f).
  - When no header URI is available and `endpointUrl` is absent/unusable, the
    result is empty — the caller MUST then abort or fall back to pre-configured
    values (R-23.2-g).

## Parameters

### options

#### headerResourceMetadata?

`string`

The `resource_metadata` URI from a
  `WWW-Authenticate` header, if any (R-23.2-d).

#### endpointUrl?

`string`

The MCP server endpoint, used to build
  the well-known URIs when no header URI is present.

## Returns

`string`[]
