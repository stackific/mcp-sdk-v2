[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / validateProtectedResourceMetadata

# Function: validateProtectedResourceMetadata()

> **validateProtectedResourceMetadata**(`value`, `expectedCanonicalResource`): [`ProtectedResourceMetadataValidation`](../type-aliases/ProtectedResourceMetadataValidation.md)

Defined in: [protocol/authorization.ts:619](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization.ts#L619)

Validates a fetched protected-resource metadata document against the MCP
server it is contacting. (§23.2, R-23.2-h, R-23.2-i, R-23.2-j)

Checks:
  - the document is structurally valid (`resource` present, non-empty
    `authorization_servers`) (R-23.2-h, R-23.2-i);
  - `resource` equals the server's canonical resource identifier, accepting an
    uppercase scheme/host on either side (R-23.2-h via R-23.1-p, R-23.2-j).

On success the client then selects an authorization server from
`authorization_servers` (see [selectAuthorizationServer](selectAuthorizationServer.md)).

## Parameters

### value

`unknown`

The raw fetched document.

### expectedCanonicalResource

`string`

The canonical resource identifier of the
  MCP server the client is contacting.

## Returns

[`ProtectedResourceMetadataValidation`](../type-aliases/ProtectedResourceMetadataValidation.md)
