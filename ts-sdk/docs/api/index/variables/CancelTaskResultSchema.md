[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / CancelTaskResultSchema

# Variable: CancelTaskResultSchema

> `const` **CancelTaskResultSchema**: `ZodObject`\<\{ `resultType`: `ZodLiteral`\<`"complete"`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `resultType`: `ZodLiteral`\<`"complete"`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `resultType`: `ZodLiteral`\<`"complete"`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\> = `TaskAcknowledgementResultSchema`

Defined in: [protocol/tasks-lifecycle.ts:428](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tasks-lifecycle.ts#L428)

The `tasks/cancel` result: the empty `"complete"` acknowledgement. (§25.9, R-25.9-e, R-25.9-f)
