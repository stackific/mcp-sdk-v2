[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / SamplingInputRequestSchema

# Variable: SamplingInputRequestSchema

> `const` **SamplingInputRequestSchema**: `ZodObject`\<\{ `method`: `ZodLiteral`\<`"sampling/createMessage"`\>; `params`: `ZodRecord`\<`ZodString`, `ZodUnknown`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `method`: `ZodLiteral`\<`"sampling/createMessage"`\>; `params`: `ZodRecord`\<`ZodString`, `ZodUnknown`\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `method`: `ZodLiteral`\<`"sampling/createMessage"`\>; `params`: `ZodRecord`\<`ZodString`, `ZodUnknown`\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/multi-round-trip.ts:89](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/multi-round-trip.ts#L89)

A `"sampling/createMessage"` input request. (§11.2, §21 / S33, Deprecated)
The full `params` shape (`CreateMessageRequestParams`) is defined in S33.
