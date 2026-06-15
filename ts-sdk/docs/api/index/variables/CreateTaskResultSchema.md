[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / CreateTaskResultSchema

# Variable: CreateTaskResultSchema

> `const` **CreateTaskResultSchema**: `ZodObject`\<`object` & `object`, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/tasks.ts:376](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tasks.ts#L376)

A `Result` whose `resultType` is `"task"`: the wire form of a task handle.
(§25.3, R-25.3-c)

It carries all [Task](../type-aliases/Task.md) fields directly, plus the result-level
`resultType: "task"` discriminator and the OPTIONAL `_meta` permitted on any
`Result`. This is what a server returns in place of a request's direct result
when it turns an eligible request into a task. (§25.3)

`.passthrough()` preserves any extra `Result`/`Task` members.
