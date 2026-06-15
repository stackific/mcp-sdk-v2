[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / mayPushTaskNotification

# Function: mayPushTaskNotification()

> **mayPushTaskNotification**(`taskId`, `subscribedTaskIds`): `boolean`

Defined in: [protocol/tasks-lifecycle.ts:579](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tasks-lifecycle.ts#L579)

Returns `true` when a server MAY push `notifications/tasks` for `taskId` — i.e.
the client subscribed to it via a `taskIds` filter on `subscriptions/listen`. A
server MUST NOT push for any task NOT in the subscribed set. (§25.10, R-25.10-d,
AC-40.33)

## Parameters

### taskId

`string`

The task a notification would be about.

### subscribedTaskIds

readonly `string`[]

The `taskIds` the server accepted for this client.

## Returns

`boolean`
