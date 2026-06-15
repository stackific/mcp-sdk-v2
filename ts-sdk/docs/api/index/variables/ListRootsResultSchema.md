[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ListRootsResultSchema

# Variable: ListRootsResultSchema

> `const` **ListRootsResultSchema**: `ZodObject`\<\{ `roots`: `ZodArray`\<`ZodObject`\<\{ `uri`: `ZodString`; `name`: `ZodOptional`\<`ZodString`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `uri`: `ZodString`; `name`: `ZodOptional`\<`ZodString`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `uri`: `ZodString`; `name`: `ZodOptional`\<`ZodString`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>, `"many"`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `roots`: `ZodArray`\<`ZodObject`\<\{ `uri`: `ZodString`; `name`: `ZodOptional`\<`ZodString`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `uri`: `ZodString`; `name`: `ZodOptional`\<`ZodString`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `uri`: `ZodString`; `name`: `ZodOptional`\<`ZodString`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>, `"many"`\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `roots`: `ZodArray`\<`ZodObject`\<\{ `uri`: `ZodString`; `name`: `ZodOptional`\<`ZodString`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `uri`: `ZodString`; `name`: `ZodOptional`\<`ZodString`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `uri`: `ZodString`; `name`: `ZodOptional`\<`ZodString`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>, `"many"`\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/multi-round-trip.ts:374](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/multi-round-trip.ts#L374)

`ListRootsResult` — client response to a `"roots/list"` input request.
Full shape is defined in §21 (S32, deprecated); the S17-owned constraint
is the `roots` array. (R-11.4-e)
