[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / UntitledMultiSelectItemsSchema

# Variable: UntitledMultiSelectItemsSchema

> `const` **UntitledMultiSelectItemsSchema**: `ZodObject`\<\{ `type`: `ZodLiteral`\<`"string"`\>; `enum`: `ZodArray`\<`ZodString`, `"many"`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `type`: `ZodLiteral`\<`"string"`\>; `enum`: `ZodArray`\<`ZodString`, `"many"`\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `type`: `ZodLiteral`\<`"string"`\>; `enum`: `ZodArray`\<`ZodString`, `"many"`\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/elicitation-form.ts:225](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/elicitation-form.ts#L225)

The `items` schema of an untitled multi-select enum: a string `enum`. (§20.4)
