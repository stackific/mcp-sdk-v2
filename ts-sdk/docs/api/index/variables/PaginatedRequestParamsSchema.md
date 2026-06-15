[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / PaginatedRequestParamsSchema

# Variable: PaginatedRequestParamsSchema

> `const` **PaginatedRequestParamsSchema**: `ZodObject`\<\{ `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `cursor`: `ZodOptional`\<`ZodString`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `cursor`: `ZodOptional`\<`ZodString`\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `cursor`: `ZodOptional`\<`ZodString`\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/pagination.ts:39](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/pagination.ts#L39)

Base parameter shape for any paginated list request. (§12, §6 / S18)

`cursor` (OPTIONAL): when present the server returns results positioned after
this cursor (R-12.2-a). When absent the server returns the first page
(R-12.2-b). The empty string `""` is a valid present cursor (R-12.1-a).

`_meta` (OPTIONAL): metadata; the per-request `_meta` requirement (§4.3 / S05)
applies when this shape is used in a client request — see `RequestParamsSchema`
in S04.

`.passthrough()` allows method-specific params to survive parse.
