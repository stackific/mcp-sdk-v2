[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / TaskInputRequestsSchema

# Variable: TaskInputRequestsSchema

> `const` **TaskInputRequestsSchema**: `ZodRecord`\<`ZodString`, `ZodDiscriminatedUnion`\<`"method"`, \[`ZodObject`\<\{ `method`: `ZodLiteral`\<`"elicitation/create"`\>; `params`: `ZodRecord`\<`ZodString`, `ZodUnknown`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `method`: `ZodLiteral`\<`"elicitation/create"`\>; `params`: `ZodRecord`\<`ZodString`, `ZodUnknown`\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `method`: `ZodLiteral`\<`"elicitation/create"`\>; `params`: `ZodRecord`\<`ZodString`, `ZodUnknown`\>; \}, `ZodTypeAny`, `"passthrough"`\>\>, `ZodObject`\<\{ `method`: `ZodLiteral`\<`"roots/list"`\>; `params`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `method`: `ZodLiteral`\<`"roots/list"`\>; `params`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `method`: `ZodLiteral`\<`"roots/list"`\>; `params`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>, `ZodObject`\<\{ `method`: `ZodLiteral`\<`"sampling/createMessage"`\>; `params`: `ZodRecord`\<`ZodString`, `ZodUnknown`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `method`: `ZodLiteral`\<`"sampling/createMessage"`\>; `params`: `ZodRecord`\<`ZodString`, `ZodUnknown`\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `method`: `ZodLiteral`\<`"sampling/createMessage"`\>; `params`: `ZodRecord`\<`ZodString`, `ZodUnknown`\>; \}, `ZodTypeAny`, `"passthrough"`\>\>\]\>\>

Defined in: [protocol/tasks.ts:450](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tasks.ts#L450)

The `InputRequests` map carried on the `input_required` variant of
[DetailedTask](../type-aliases/DetailedTask.md): outstanding server requests keyed by opaque string.
(§25.4, §11.2)

Keys are opaque strings chosen by the server; each value is an
[InputRequest](../type-aliases/InputRequest.md) (S17 / §11.2 — e.g. an elicitation). The client returns
matching responses via `tasks/update` (S40). The per-key `InputRequest` shape
is owned by S17 and reused here, never redefined.
