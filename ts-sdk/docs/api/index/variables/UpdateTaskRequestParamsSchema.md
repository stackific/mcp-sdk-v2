[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / UpdateTaskRequestParamsSchema

# Variable: UpdateTaskRequestParamsSchema

> `const` **UpdateTaskRequestParamsSchema**: `ZodObject`\<\{ `taskId`: `ZodString`; `inputResponses`: `ZodRecord`\<`ZodString`, `ZodUnknown`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `taskId`: `ZodString`; `inputResponses`: `ZodRecord`\<`ZodString`, `ZodUnknown`\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `taskId`: `ZodString`; `inputResponses`: `ZodRecord`\<`ZodString`, `ZodUnknown`\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/tasks-lifecycle.ts:258](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tasks-lifecycle.ts#L258)

The `params` of a `tasks/update` request: REQUIRED `taskId` and
`inputResponses`. (§25.8, R-25.8-a)

`.passthrough()` preserves the per-request `_meta` and any other members.
