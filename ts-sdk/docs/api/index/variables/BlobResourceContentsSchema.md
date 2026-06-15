[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / BlobResourceContentsSchema

# Variable: BlobResourceContentsSchema

> `const` **BlobResourceContentsSchema**: `ZodObject`\<\{ `uri`: `ZodString`; `mimeType`: `ZodOptional`\<`ZodString`\>; `blob`: `ZodEffects`\<`ZodString`, `string`, `string`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `uri`: `ZodString`; `mimeType`: `ZodOptional`\<`ZodString`\>; `blob`: `ZodEffects`\<`ZodString`, `string`, `string`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `uri`: `ZodString`; `mimeType`: `ZodOptional`\<`ZodString`\>; `blob`: `ZodEffects`\<`ZodString`, `string`, `string`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [types/resource-contents.ts:51](https://github.com/stackific/mcp-sdk-node/blob/main/src/types/resource-contents.ts#L51)

Binary variant of resource contents. `blob` is Base64-encoded raw bytes.
(R-14.5-f)
