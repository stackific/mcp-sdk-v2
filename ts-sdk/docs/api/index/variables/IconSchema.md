[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / IconSchema

# Variable: IconSchema

> `const` **IconSchema**: `ZodObject`\<\{ `src`: `ZodString`; `mimeType`: `ZodOptional`\<`ZodString`\>; `sizes`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `theme`: `ZodOptional`\<`ZodEnum`\<\[`"light"`, `"dark"`\]\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `src`: `ZodString`; `mimeType`: `ZodOptional`\<`ZodString`\>; `sizes`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `theme`: `ZodOptional`\<`ZodEnum`\<\[`"light"`, `"dark"`\]\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `src`: `ZodString`; `mimeType`: `ZodOptional`\<`ZodString`\>; `sizes`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `theme`: `ZodOptional`\<`ZodEnum`\<\[`"light"`, `"dark"`\]\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [types/icon.ts:28](https://github.com/stackific/mcp-sdk-node/blob/main/src/types/icon.ts#L28)

`Icon` schema (§14.2, R-14.2-c – R-14.2-j).

`src` is REQUIRED; all other fields are OPTIONAL.
The `theme` field is a closed enum: only `"light"` and `"dark"` are valid. (R-14-a)
Additional unknown fields are ignored via `.passthrough()` (§2.3.4).
