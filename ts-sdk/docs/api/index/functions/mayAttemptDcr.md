[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / mayAttemptDcr

# Function: mayAttemptDcr()

> **mayAttemptDcr**(`metadata`): `boolean`

Defined in: [protocol/authorization-registration.ts:206](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L206)

Returns `true` when a client MAY attempt Dynamic Client Registration against
this authorization server — i.e. the metadata advertises a
`registration_endpoint`. A client MUST NOT attempt DCR otherwise. (R-23.11-e)

## Parameters

### metadata

`Pick`\<[`AuthorizationServerMetadata`](../type-aliases/AuthorizationServerMetadata.md), `"registration_endpoint"`\>

The validated authorization-server metadata.

## Returns

`boolean`
