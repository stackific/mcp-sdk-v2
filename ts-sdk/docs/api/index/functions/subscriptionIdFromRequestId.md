[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / subscriptionIdFromRequestId

# Function: subscriptionIdFromRequestId()

> **subscriptionIdFromRequestId**(`id`): `string`

Defined in: [protocol/streaming.ts:120](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/streaming.ts#L120)

Serializes a `subscriptions/listen` request `id` into the string carried in
`io.modelcontextprotocol/subscriptionId` — e.g. `1` → `"1"`, `"abc"` → `"abc"`.
(§10.4, R-10.4-b)

## Parameters

### id

`string` \| `number`

## Returns

`string`
