[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / subscribedTaskIds

# Function: subscribedTaskIds()

> **subscribedTaskIds**(`filter`): `string`[]

Defined in: [protocol/tasks-lifecycle.ts:564](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tasks-lifecycle.ts#L564)

Returns the `taskIds` a `subscriptions/listen` filter opts in to, or `[]` when
none. (§25.10, R-25.10-b)

## Parameters

### filter

`unknown`

The `notifications` filter from a `subscriptions/listen` request.

## Returns

`string`[]
