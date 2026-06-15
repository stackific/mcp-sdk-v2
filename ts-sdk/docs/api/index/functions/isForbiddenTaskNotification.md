[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isForbiddenTaskNotification

# Function: isForbiddenTaskNotification()

> **isForbiddenTaskNotification**(`method`): `boolean`

Defined in: [protocol/tasks-lifecycle.ts:636](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tasks-lifecycle.ts#L636)

Returns `true` when `method` is a notification kind that MUST NOT be sent for a
task (`notifications/progress`, `notifications/message`, or
`notifications/cancelled`); sending it for a task is a protocol violation.
(§25.9, §25.10, R-25.9-a, R-25.10-g, AC-40.23, AC-40.36)

## Parameters

### method

`string`

## Returns

`boolean`
