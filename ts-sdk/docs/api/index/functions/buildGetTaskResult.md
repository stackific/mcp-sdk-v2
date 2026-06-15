[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildGetTaskResult

# Function: buildGetTaskResult()

> **buildGetTaskResult**(`task`): `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\> \| `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\> \| `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\> \| `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\> \| `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\> & `object`

Defined in: [protocol/tasks-lifecycle.ts:229](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tasks-lifecycle.ts#L229)

Builds the `tasks/get` result for a task's current `DetailedTask` state: the
`DetailedTask` (status + its status-specific payload) plus the
`resultType: "complete"` discriminator. The server MUST inspect the current
status and return the matching variant — this helper does so by carrying the
caller-supplied `DetailedTask` verbatim and stamping the discriminator.
(§25.7, R-25.7-e, R-25.7-f … R-25.7-l, AC-40.1, AC-40.3 … AC-40.7)

## Parameters

### task

`objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\> \| `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\> \| `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\> \| `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\> \| `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>

The task's current `DetailedTask` (already in the correct variant
  for its status; validated against [DetailedTaskSchema](../variables/DetailedTaskSchema.md)).

## Returns

## Throws

when `task` is not a well-formed `DetailedTask`.
