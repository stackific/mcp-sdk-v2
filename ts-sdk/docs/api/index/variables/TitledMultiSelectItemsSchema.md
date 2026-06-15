[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / TitledMultiSelectItemsSchema

# Variable: TitledMultiSelectItemsSchema

> `const` **TitledMultiSelectItemsSchema**: `ZodObject`\<\{ `anyOf`: `ZodArray`\<`ZodObject`\<\{ `const`: `ZodString`; `title`: `ZodString`; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `const`: `ZodString`; `title`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `const`: `ZodString`; `title`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>\>, `"many"`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `anyOf`: `ZodArray`\<`ZodObject`\<\{ `const`: `ZodString`; `title`: `ZodString`; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `const`: `ZodString`; `title`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `const`: `ZodString`; `title`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>\>, `"many"`\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `anyOf`: `ZodArray`\<`ZodObject`\<\{ `const`: `ZodString`; `title`: `ZodString`; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `const`: `ZodString`; `title`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `const`: `ZodString`; `title`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>\>, `"many"`\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/elicitation-form.ts:259](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/elicitation-form.ts#L259)

The `items` schema of a titled multi-select enum: an `anyOf` of options. (§20.4)
