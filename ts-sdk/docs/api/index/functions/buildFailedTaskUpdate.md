[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildFailedTaskUpdate

# Function: buildFailedTaskUpdate()

> **buildFailedTaskUpdate**(`base`, `error`, `statusMessage?`): `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\> \| `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\> \| `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\> \| `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\> \| `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>

Defined in: [protocol/tasks-lifecycle.ts:803](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tasks-lifecycle.ts#L803)

Builds the terminal `DetailedTask` for a task that hit a JSON-RPC PROTOCOL error
during execution: `status: "failed"` carrying the inline `error`, and SHOULD
include a diagnostic `statusMessage`. (§25.11, R-25.11-f, R-25.11-g, AC-40.42)

The `failed` status MUST NOT be used for non-protocol faults — for an
application-level error use [buildCompletedTaskUpdate](buildCompletedTaskUpdate.md) with the error
carried inside `result`. (R-25.11-h)

## Parameters

### base

`Record`\<`string`, `unknown`\>

The task's base fields (`taskId`, `createdAt`,
  `lastUpdatedAt`, `ttlMs`, and any other `Task` members).

### error

`unknown`

The JSON-RPC error that occurred (validated against
  [McpErrorSchema](../variables/McpErrorSchema.md)).

### statusMessage?

`string`

OPTIONAL diagnostic message (SHOULD be supplied, R-25.11-g).

## Returns

`objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\> \| `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\> \| `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\> \| `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\> \| `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>
