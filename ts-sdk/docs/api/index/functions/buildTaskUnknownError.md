[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildTaskUnknownError

# Function: buildTaskUnknownError()

> **buildTaskUnknownError**(`taskId`, `operation?`): `object`

Defined in: [protocol/tasks-lifecycle.ts:129](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tasks-lifecycle.ts#L129)

Builds the JSON-RPC `-32602` error a server returns to `tasks/get` /
`tasks/update` / `tasks/cancel` when `taskId` does not correspond to a known
task (never existed, or expired and removed). The `message` is informative and
non-normative; a client SHOULD treat the response as evidence the task is
terminal and unavailable and stop polling. (§25.7, §25.11, R-25.7-r, R-25.8-m,
R-25.9-g, R-25.11-d, R-25.11-e, AC-40.12, AC-40.21, AC-40.27)

## Parameters

### taskId

`string`

The opaque task identifier that was not found.

### operation?

`string` = `'retrieve'`

The Tasks operation that was attempted (default `"retrieve"`),
  used only to phrase the human-readable message.

## Returns

`object`

### code

> **code**: `-32602`

### message

> **message**: `string`

### data

> **data**: `object`

#### data.taskId

> **taskId**: `string`
