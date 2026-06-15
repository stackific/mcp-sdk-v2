[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / GetTaskResultSchema

# Variable: GetTaskResultSchema

> `const` **GetTaskResultSchema**: `ZodIntersection`\<`ZodDiscriminatedUnion`\<`"status"`, \[`ZodObject`\<`object` & `object`, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>\>, `ZodObject`\<`object` & `object`, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>\>, `ZodObject`\<`object` & `object`, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>\>, `ZodObject`\<`object` & `object`, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>\>, `ZodObject`\<`object` & `object`, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>\>\]\>, `ZodObject`\<\{ `resultType`: `ZodLiteral`\<`"complete"`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `"strip"`, `ZodTypeAny`, \{ `resultType`: `"complete"`; `_meta?`: `Record`\<`string`, `unknown`\>; \}, \{ `resultType`: `"complete"`; `_meta?`: `Record`\<`string`, `unknown`\>; \}\>\>

Defined in: [protocol/tasks-lifecycle.ts:200](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tasks-lifecycle.ts#L200)

The `tasks/get` result: a base `Result` whose `resultType` MUST be the literal
`"complete"`, merged with the current `DetailedTask`. (§25.7, R-25.7-e, R-25.7-f)

The body is the status-appropriate `DetailedTask` variant (S39's
[DetailedTaskSchema](DetailedTaskSchema.md)): `working`/`cancelled` carry no extra payload,
`input_required` carries `inputRequests`, `completed` carries `result`, `failed`
carries `error`. (R-25.7-g … R-25.7-l)

Modeled as the `DetailedTask` discriminated union intersected with the
`resultType: "complete"` discriminator and the OPTIONAL `_meta` of any `Result`,
so the per-variant status→payload requirement is enforced by S39's schema.
