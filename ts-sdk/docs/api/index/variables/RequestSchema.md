[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / RequestSchema

# Variable: RequestSchema

> `const` **RequestSchema**: `ZodObject`\<\{ `id`: `ZodUnion`\<\[`ZodString`, `ZodNumber`, `ZodNull`\]\>; `method`: `ZodString`; `params`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `id`: `ZodUnion`\<\[`ZodString`, `ZodNumber`, `ZodNull`\]\>; `method`: `ZodString`; `params`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `id`: `ZodUnion`\<\[`ZodString`, `ZodNumber`, `ZodNull`\]\>; `method`: `ZodString`; `params`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/messages.ts:23](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/messages.ts#L23)

Abstract request schema (§2.2, AC-01.6).

`id` and `method` are REQUIRED. `params` is OPTIONAL.
`.passthrough()` allows the S03 concrete envelope (e.g. `jsonrpc`) to extend
this shape without breaking validation.
