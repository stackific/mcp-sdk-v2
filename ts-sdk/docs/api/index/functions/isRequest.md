[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isRequest

# Function: isRequest()

> **isRequest**(`msg`): `boolean`

Defined in: [protocol/messages.ts:68](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/messages.ts#L68)

Returns `true` when the value has an `id` field, indicating it is a request
rather than a notification. (AC-01.6)

## Parameters

### msg

`Record`\<`string`, `unknown`\>

## Returns

`boolean`
