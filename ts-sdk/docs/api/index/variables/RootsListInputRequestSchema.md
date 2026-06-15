[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / RootsListInputRequestSchema

# Variable: RootsListInputRequestSchema

> `const` **RootsListInputRequestSchema**: `ZodObject`\<\{ `method`: `ZodLiteral`\<`"roots/list"`\>; `params`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `method`: `ZodLiteral`\<`"roots/list"`\>; `params`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `method`: `ZodLiteral`\<`"roots/list"`\>; `params`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/multi-round-trip.ts:76](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/multi-round-trip.ts#L76)

A `"roots/list"` input request. (§11.2, §21 / S32, Deprecated)
`params` is optional (may carry only `{ _meta: object }`).
