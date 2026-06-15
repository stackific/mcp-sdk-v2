[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ListResourcesRequestParamsSchema

# Variable: ListResourcesRequestParamsSchema

> `const` **ListResourcesRequestParamsSchema**: `ZodObject`\<\{ `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `cursor`: `ZodOptional`\<`ZodString`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `cursor`: `ZodOptional`\<`ZodString`\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `cursor`: `ZodOptional`\<`ZodString`\>; \}, `ZodTypeAny`, `"passthrough"`\>\> = `PaginatedRequestParamsSchema`

Defined in: [protocol/resources.ts:424](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/resources.ts#L424)

The `params` of a `resources/list` request. Extends the paginated-request shape
(S18), so it MAY carry an opaque `cursor` and OPTIONAL `_meta`; both are
optional. (§17.2, R-17.2-a, R-17.2-i)
