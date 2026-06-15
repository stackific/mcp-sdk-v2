[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / mayAttemptCimd

# Function: mayAttemptCimd()

> **mayAttemptCimd**(`metadata`): `boolean`

Defined in: [protocol/authorization-registration.ts:193](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L193)

Returns `true` when a client MAY attempt CIMD against this authorization
server — i.e. the metadata sets `client_id_metadata_document_supported: true`.
A client MUST NOT attempt CIMD otherwise. (R-23.11-d)

## Parameters

### metadata

`Pick`\<[`AuthorizationServerMetadata`](../type-aliases/AuthorizationServerMetadata.md), `"client_id_metadata_document_supported"`\>

The validated authorization-server metadata.

## Returns

`boolean`
