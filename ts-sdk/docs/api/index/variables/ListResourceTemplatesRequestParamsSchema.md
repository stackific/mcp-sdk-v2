[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ListResourceTemplatesRequestParamsSchema

# Variable: ListResourceTemplatesRequestParamsSchema

> `const` **ListResourceTemplatesRequestParamsSchema**: `ZodObject`\<\{ `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `cursor`: `ZodOptional`\<`ZodString`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `cursor`: `ZodOptional`\<`ZodString`\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `cursor`: `ZodOptional`\<`ZodString`\>; \}, `ZodTypeAny`, `"passthrough"`\>\> = `PaginatedRequestParamsSchema`

Defined in: [protocol/resources.ts:477](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/resources.ts#L477)

The `params` of a `resources/templates/list` request. Like `resources/list`, it
extends the paginated-request shape and MAY carry `cursor` / `_meta`. (§17.3, R-17.3-a)
