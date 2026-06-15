[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ListToolsRequestParamsSchema

# Variable: ListToolsRequestParamsSchema

> `const` **ListToolsRequestParamsSchema**: `ZodObject`\<\{ `cursor`: `ZodOptional`\<`ZodString`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `cursor`: `ZodOptional`\<`ZodString`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `cursor`: `ZodOptional`\<`ZodString`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/tools.ts:650](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools.ts#L650)

The `params` of a `tools/list` request: a paginated request whose only field
is the OPTIONAL opaque `cursor` (resume position) plus the OPTIONAL `_meta`.
(§16.2, R-16.2-a; reuses the S18 `Cursor` shape.)

Modelled as an OPTIONAL params object: a first-page request MAY omit `cursor`
(and indeed omit `params` entirely — see `ListToolsRequestSchema`).
`.passthrough()` preserves forward-compatible members.
