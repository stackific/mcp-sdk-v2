[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / readSubscriptionId

# Function: readSubscriptionId()

> **readSubscriptionId**(`params`): `string` \| `undefined`

Defined in: [protocol/streaming.ts:260](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/streaming.ts#L260)

Returns the `io.modelcontextprotocol/subscriptionId` value from a notification's
`params._meta`, or `undefined` when absent or not a string. The lookup is
case-sensitive and verbatim. (§10.4, R-10.4-a, R-10.4-f)

## Parameters

### params

`unknown`

## Returns

`string` \| `undefined`
