[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / CompletedTaskSchema

# Variable: CompletedTaskSchema

> `const` **CompletedTaskSchema**: `ZodObject`\<`object` & `object`, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/tasks.ts:477](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tasks.ts#L477)

`status: "completed"` variant — carries the verbatim ordinary `result` the
augmented request would have produced (including its own `resultType` and any
`_meta`). (§25.4, R-25.5-d)
