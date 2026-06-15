[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / TaskAcknowledgementResultSchema

# Variable: TaskAcknowledgementResultSchema

> `const` **TaskAcknowledgementResultSchema**: `ZodObject`\<\{ `resultType`: `ZodLiteral`\<`"complete"`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `resultType`: `ZodLiteral`\<`"complete"`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `resultType`: `ZodLiteral`\<`"complete"`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/tasks-lifecycle.ts:412](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tasks-lifecycle.ts#L412)

The empty acknowledgement shared by `tasks/update` and `tasks/cancel`: a `Result`
whose `resultType` MUST be the literal `"complete"` and whose body is otherwise
empty. (§25.8, §25.9, R-25.8-j, R-25.9-e)

`.passthrough()` preserves an OPTIONAL `_meta` and any other `Result` members.
