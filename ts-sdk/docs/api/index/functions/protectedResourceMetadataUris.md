[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / protectedResourceMetadataUris

# Function: protectedResourceMetadataUris()

> **protectedResourceMetadataUris**(`options`): `string`[]

Defined in: [protocol/authorization-registration.ts:637](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L637)

Resolves the ordered protected-resource-metadata URIs to try, honouring the
`WWW-Authenticate` `resource_metadata` precedence. (R-23.17-a, R-23.17-b)

  - When the `401` carried a `resource_metadata` URL, that single URL MUST be
    used (R-23.17-a);
  - otherwise the well-known URIs are returned in order — path-prefixed first,
    then host root — via S35's [protectedResourceWellKnownUris](protectedResourceWellKnownUris.md) (R-23.17-b).

## Parameters

### options

#### resourceMetadataUrl?

`string`

The `resource_metadata` URL from the
  `401`'s `WWW-Authenticate` header, if any (R-23.17-a).

#### mcpEndpointUrl?

`string`

The MCP endpoint URL, used to build the
  well-known fallbacks (R-23.17-b).

## Returns

`string`[]
