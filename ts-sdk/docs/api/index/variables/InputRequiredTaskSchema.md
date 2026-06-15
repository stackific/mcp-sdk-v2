[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / InputRequiredTaskSchema

# Variable: InputRequiredTaskSchema

> `const` **InputRequiredTaskSchema**: `ZodObject`\<`object` & `object`, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/tasks.ts:465](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tasks.ts#L465)

`status: "input_required"` variant — carries the outstanding `inputRequests`
the client must fulfill before the task can continue. (§25.4)
