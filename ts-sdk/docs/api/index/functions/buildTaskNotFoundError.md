[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildTaskNotFoundError

# Function: buildTaskNotFoundError()

> **buildTaskNotFoundError**(`taskId`): `object`

Defined in: [protocol/tasks.ts:683](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tasks.ts#L683)

Builds the JSON-RPC not-found error a server returns when queried for a
`taskId` it no longer holds (unknown, or expired-and-discarded). (§25.4,
§25.6, R-25.4-c, R-25.6-g, AC-39.11)

## Parameters

### taskId

`string`

The opaque task identifier that was not found.

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
