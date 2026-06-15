[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isNotification

# Function: isNotification()

> **isNotification**(`msg`): `boolean`

Defined in: [protocol/messages.ts:76](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/messages.ts#L76)

Returns `true` when the value has a `method` and NO `id`, indicating it is a
notification. Receivers MUST NOT reply to notifications. (R-2.2-e, AC-01.7)

## Parameters

### msg

`Record`\<`string`, `unknown`\>

## Returns

`boolean`
