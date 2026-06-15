[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / CancelTaskRequestParamsSchema

# Variable: CancelTaskRequestParamsSchema

> `const` **CancelTaskRequestParamsSchema**: `ZodObject`\<\{ `taskId`: `ZodString`; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `taskId`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `taskId`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/tasks-lifecycle.ts:377](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tasks-lifecycle.ts#L377)

The `params` of a `tasks/cancel` request: a single REQUIRED `taskId`. (§25.9,
R-25.9-b)

`.passthrough()` preserves the per-request `_meta` and any other members.
