[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / mayDeliverResourceUpdate

# Function: mayDeliverResourceUpdate()

> **mayDeliverResourceUpdate**(`updatedUri`, `subscribedUris`): `boolean`

Defined in: [protocol/streaming.ts:445](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/streaming.ts#L445)

Returns `true` when a `notifications/resources/updated` for `updatedUri` is
permitted on a subscription whose acknowledged `resourceSubscriptions` are
`subscribedUris` — i.e. the URI (or a parent) was listed. A server MUST NOT send
an update for an unlisted resource. (§10.2, R-10.2-l, R-10.2-m, §10.5 R-10.5-h)

## Parameters

### updatedUri

`string`

### subscribedUris

readonly `string`[]

## Returns

`boolean`
