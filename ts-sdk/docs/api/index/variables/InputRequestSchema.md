[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / InputRequestSchema

# Variable: InputRequestSchema

> `const` **InputRequestSchema**: `ZodDiscriminatedUnion`\<`"method"`, \[`ZodObject`\<\{ `method`: `ZodLiteral`\<`"elicitation/create"`\>; `params`: `ZodRecord`\<`ZodString`, `ZodUnknown`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `method`: `ZodLiteral`\<`"elicitation/create"`\>; `params`: `ZodRecord`\<`ZodString`, `ZodUnknown`\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `method`: `ZodLiteral`\<`"elicitation/create"`\>; `params`: `ZodRecord`\<`ZodString`, `ZodUnknown`\>; \}, `ZodTypeAny`, `"passthrough"`\>\>, `ZodObject`\<\{ `method`: `ZodLiteral`\<`"roots/list"`\>; `params`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `method`: `ZodLiteral`\<`"roots/list"`\>; `params`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `method`: `ZodLiteral`\<`"roots/list"`\>; `params`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>, `ZodObject`\<\{ `method`: `ZodLiteral`\<`"sampling/createMessage"`\>; `params`: `ZodRecord`\<`ZodString`, `ZodUnknown`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `method`: `ZodLiteral`\<`"sampling/createMessage"`\>; `params`: `ZodRecord`\<`ZodString`, `ZodUnknown`\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `method`: `ZodLiteral`\<`"sampling/createMessage"`\>; `params`: `ZodRecord`\<`ZodString`, `ZodUnknown`\>; \}, `ZodTypeAny`, `"passthrough"`\>\>\]\>

Defined in: [protocol/multi-round-trip.ts:105](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/multi-round-trip.ts#L105)

A single input request: a discriminated union over `method`. (§11.2)

A client MUST treat an `InputRequest` whose `method` is none of the three
recognized values as an unrecognized kind and treat the enclosing
`InputRequiredResult` as an error. (R-11.2-k, R-11.2-l)
