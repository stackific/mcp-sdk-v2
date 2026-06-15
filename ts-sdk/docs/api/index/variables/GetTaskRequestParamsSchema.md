[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / GetTaskRequestParamsSchema

# Variable: GetTaskRequestParamsSchema

> `const` **GetTaskRequestParamsSchema**: `ZodObject`\<\{ `taskId`: `ZodString`; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `taskId`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `taskId`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/tasks-lifecycle.ts:159](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tasks-lifecycle.ts#L159)

The `params` of a `tasks/get` request: a single REQUIRED `taskId`. (§25.7,
R-25.7-a)

`taskId` MUST be the server-generated identifier sent verbatim, exactly as it
appeared in the originating `CreateTaskResult` (S39). (R-25.7-b) `.passthrough()`
preserves the per-request `_meta` and any other members.
