[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildCompletedTaskUpdate

# Function: buildCompletedTaskUpdate()

> **buildCompletedTaskUpdate**(`base`, `result`): `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\> \| `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\> \| `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\> \| `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\> \| `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>

Defined in: [protocol/tasks-lifecycle.ts:829](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tasks-lifecycle.ts#L829)

Builds the terminal `DetailedTask` for a task whose underlying request COMPLETED
at the protocol level: `status: "completed"` carrying the verbatim `result` — the
value the original request would have returned synchronously. An application-level
error (e.g. a tool result with `isError: true`) is carried INSIDE `result`, NOT
as a `failed` task. (§25.11, R-25.11-i, AC-40.5, AC-40.43)

## Parameters

### base

`Record`\<`string`, `unknown`\>

The task's base fields (`taskId`, `createdAt`, `lastUpdatedAt`,
  `ttlMs`, etc.).

### result

`Record`\<`string`, `unknown`\>

The verbatim ordinary result of the underlying request.

## Returns

`objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\> \| `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\> \| `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\> \| `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\> \| `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>
