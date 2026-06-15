[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / IconsSchema

# Variable: IconsSchema

> `const` **IconsSchema**: `ZodObject`\<\{ `icons`: `ZodOptional`\<`ZodArray`\<`ZodObject`\<\{ `src`: `ZodString`; `mimeType`: `ZodOptional`\<`ZodString`\>; `sizes`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `theme`: `ZodOptional`\<`ZodEnum`\<\[`"light"`, `"dark"`\]\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `src`: `ZodString`; `mimeType`: `ZodOptional`\<`ZodString`\>; `sizes`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `theme`: `ZodOptional`\<`ZodEnum`\<\[`"light"`, `"dark"`\]\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `src`: `ZodString`; `mimeType`: `ZodOptional`\<`ZodString`\>; `sizes`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `theme`: `ZodOptional`\<`ZodEnum`\<\[`"light"`, `"dark"`\]\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>, `"many"`\>\>; \}, `"strip"`, `ZodTypeAny`, \{ `icons?`: `objectOutputType`\<\{ `src`: `ZodString`; `mimeType`: `ZodOptional`\<`ZodString`\>; `sizes`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `theme`: `ZodOptional`\<`ZodEnum`\<\[`"light"`, `"dark"`\]\>\>; \}, `ZodTypeAny`, `"passthrough"`\>[]; \}, \{ `icons?`: `objectInputType`\<\{ `src`: `ZodString`; `mimeType`: `ZodOptional`\<`ZodString`\>; `sizes`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `theme`: `ZodOptional`\<`ZodEnum`\<\[`"light"`, `"dark"`\]\>\>; \}, `ZodTypeAny`, `"passthrough"`\>[]; \}\>

Defined in: [types/icon.ts:48](https://github.com/stackific/mcp-sdk-node/blob/main/src/types/icon.ts#L48)

`Icons` mixin schema — contributes the OPTIONAL `icons` array. (R-14.2-b, R-14.2-v)
