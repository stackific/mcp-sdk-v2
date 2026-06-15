[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / PaginatedResultSchema

# Variable: PaginatedResultSchema

> `const` **PaginatedResultSchema**: `ZodObject`\<\{ `resultType`: `ZodString`; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `nextCursor`: `ZodOptional`\<`ZodString`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `resultType`: `ZodString`; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `nextCursor`: `ZodOptional`\<`ZodString`\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `resultType`: `ZodString`; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `nextCursor`: `ZodOptional`\<`ZodString`\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/pagination.ts:65](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/pagination.ts#L65)

Base result shape for any paginated list result. (§12 / S18)

`nextCursor` (OPTIONAL): when present, more results MAY follow (R-12.2-c)
and the client uses this exact value as `cursor` on the next request.
When absent, this is the final page (R-12.2-d, R-12.3-c).

The empty string `""` is a valid `nextCursor` (R-12.3-d) and MUST be sent
back as `cursor` to continue — it is NOT an end-of-results signal.

Method-specific list members (e.g. `tools`, `resources`) are preserved via
`.passthrough()`.
