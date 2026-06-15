[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / CancelTaskRequestSchema

# Variable: CancelTaskRequestSchema

> `const` **CancelTaskRequestSchema**: `ZodObject`\<\{ `jsonrpc`: `ZodLiteral`\<`"2.0"`\>; `id`: `ZodUnion`\<\[`ZodString`, `ZodNumber`\]\>; `method`: `ZodLiteral`\<`"tasks/cancel"`\>; `params`: `ZodObject`\<\{ `taskId`: `ZodString`; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `taskId`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `taskId`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `jsonrpc`: `ZodLiteral`\<`"2.0"`\>; `id`: `ZodUnion`\<\[`ZodString`, `ZodNumber`\]\>; `method`: `ZodLiteral`\<`"tasks/cancel"`\>; `params`: `ZodObject`\<\{ `taskId`: `ZodString`; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `taskId`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `taskId`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `jsonrpc`: `ZodLiteral`\<`"2.0"`\>; `id`: `ZodUnion`\<\[`ZodString`, `ZodNumber`\]\>; `method`: `ZodLiteral`\<`"tasks/cancel"`\>; `params`: `ZodObject`\<\{ `taskId`: `ZodString`; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `taskId`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `taskId`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/tasks-lifecycle.ts:387](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tasks-lifecycle.ts#L387)

The full `tasks/cancel` request envelope. (§25.9)
