[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / TextResourceContentsSchema

# Variable: TextResourceContentsSchema

> `const` **TextResourceContentsSchema**: `ZodObject`\<\{ `uri`: `ZodString`; `mimeType`: `ZodOptional`\<`ZodString`\>; `text`: `ZodString`; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `uri`: `ZodString`; `mimeType`: `ZodOptional`\<`ZodString`\>; `text`: `ZodString`; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `uri`: `ZodString`; `mimeType`: `ZodOptional`\<`ZodString`\>; `text`: `ZodString`; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [types/resource-contents.ts:29](https://github.com/stackific/mcp-sdk-node/blob/main/src/types/resource-contents.ts#L29)

Text variant of resource contents. Use ONLY when the resource can actually
be represented as text rather than binary data. (R-14.5-d, R-14.5-e)
