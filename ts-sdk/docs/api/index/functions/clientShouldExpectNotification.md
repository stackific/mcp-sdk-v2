[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / clientShouldExpectNotification

# Function: clientShouldExpectNotification()

> **clientShouldExpectNotification**(`notification`, `serverCaps`): `boolean`

Defined in: [protocol/capability-negotiation.ts:287](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/capability-negotiation.ts#L287)

Returns `true` when a client should expect `notification` given the server's
declared capabilities. When the gating sub-flag is absent or `false`, the
client MUST NOT expect the notification. (R-6.3-h, R-6.3-l, R-6.3-o)

## Parameters

### notification

`string`

### serverCaps

`Record`\<`string`, `unknown`\>

## Returns

`boolean`
