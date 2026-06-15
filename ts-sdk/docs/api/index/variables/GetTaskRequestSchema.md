[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / GetTaskRequestSchema

# Variable: GetTaskRequestSchema

> `const` **GetTaskRequestSchema**: `ZodObject`\<\{ `jsonrpc`: `ZodLiteral`\<`"2.0"`\>; `id`: `ZodUnion`\<\[`ZodString`, `ZodNumber`\]\>; `method`: `ZodLiteral`\<`"tasks/get"`\>; `params`: `ZodObject`\<\{ `taskId`: `ZodString`; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `taskId`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `taskId`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `jsonrpc`: `ZodLiteral`\<`"2.0"`\>; `id`: `ZodUnion`\<\[`ZodString`, `ZodNumber`\]\>; `method`: `ZodLiteral`\<`"tasks/get"`\>; `params`: `ZodObject`\<\{ `taskId`: `ZodString`; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `taskId`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `taskId`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `jsonrpc`: `ZodLiteral`\<`"2.0"`\>; `id`: `ZodUnion`\<\[`ZodString`, `ZodNumber`\]\>; `method`: `ZodLiteral`\<`"tasks/get"`\>; `params`: `ZodObject`\<\{ `taskId`: `ZodString`; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `taskId`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `taskId`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/tasks-lifecycle.ts:169](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tasks-lifecycle.ts#L169)

The full `tasks/get` request envelope. (§25.7)
