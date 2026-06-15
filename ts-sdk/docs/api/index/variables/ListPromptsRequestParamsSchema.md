[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ListPromptsRequestParamsSchema

# Variable: ListPromptsRequestParamsSchema

> `const` **ListPromptsRequestParamsSchema**: `ZodObject`\<\{ `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `cursor`: `ZodOptional`\<`ZodString`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `cursor`: `ZodOptional`\<`ZodString`\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `cursor`: `ZodOptional`\<`ZodString`\>; \}, `ZodTypeAny`, `"passthrough"`\>\> = `PaginatedRequestParamsSchema`

Defined in: [protocol/prompts.ts:277](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/prompts.ts#L277)

The `params` of a `prompts/list` request: the paginated request shape (S18)
carrying an OPTIONAL opaque `cursor` and OPTIONAL `_meta`. (§18.2)

`cursor` is treated as opaque — a client MUST NOT construct, parse, or modify
it; it is echoed back verbatim from a prior `nextCursor`. (R-18.2-a – R-18.2-c,
AC-28.11). Reuses `PaginatedRequestParamsSchema` (S18) rather than redefining
the cursor field.
