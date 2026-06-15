[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / FailedTaskSchema

# Variable: FailedTaskSchema

> `const` **FailedTaskSchema**: `ZodObject`\<`object` & `object`, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/tasks.ts:488](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tasks.ts#L488)

`status: "failed"` variant — carries the inline JSON-RPC `error` object that
occurred during execution. (§25.4, R-25.5-d)
