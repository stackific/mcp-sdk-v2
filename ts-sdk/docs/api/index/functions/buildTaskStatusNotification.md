[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildTaskStatusNotification

# Function: buildTaskStatusNotification()

> **buildTaskStatusNotification**(`task`): `objectOutputType`

Defined in: [protocol/tasks-lifecycle.ts:528](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tasks-lifecycle.ts#L528)

Builds a `notifications/tasks` notification carrying a complete `DetailedTask`
for the task's current status — identical to what `tasks/get` would return at
that moment, so a subscribed client need not issue an extra `tasks/get`. (§25.10,
R-25.10-a, AC-40.31)

A server MUST NOT push this for a task the client did not subscribe to via a
`taskIds` filter ([mayPushTaskNotification](mayPushTaskNotification.md), R-25.10-d).

## Parameters

### task

`objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\> \| `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\> \| `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\> \| `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\> \| `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>

The task's current `DetailedTask` (validated against
  [DetailedTaskSchema](../variables/DetailedTaskSchema.md)).

## Returns

`objectOutputType`

## Throws

when `task` is not a well-formed `DetailedTask`.
