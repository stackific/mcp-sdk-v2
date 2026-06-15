[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildResourceUpdatedNotification

# Function: buildResourceUpdatedNotification()

> **buildResourceUpdatedNotification**(`uri`, `subscriptionId`, `extraMeta?`): `objectOutputType`

Defined in: [protocol/resources-read.ts:472](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/resources-read.ts#L472)

Builds a `notifications/resources/updated` notification carrying the changed
resource `uri` (which MAY be a sub-resource of the subscribed URI) and the
subscription id under `io.modelcontextprotocol/subscriptionId` in `_meta`.
(§17.7, R-17.7-f, R-17.7-g, R-17.7-h)

## Parameters

### uri

`string`

The updated resource URI (REQUIRED, absolute).

### subscriptionId

`string`

The subscription id to correlate against (the
  `subscriptions/listen` request id, serialized).

### extraMeta?

`Record`\<`string`, `unknown`\> = `{}`

OPTIONAL additional `_meta` members.

## Returns

`objectOutputType`
