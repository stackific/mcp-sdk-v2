[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / RequestParamsSchema

# Variable: RequestParamsSchema

> `const` **RequestParamsSchema**: `ZodObject`\<\{ `_meta`: `ZodRecord`\<`ZodString`, `ZodUnknown`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `_meta`: `ZodRecord`\<`ZodString`, `ZodUnknown`\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `_meta`: `ZodRecord`\<`ZodString`, `ZodUnknown`\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [jsonrpc/payload.ts:146](https://github.com/stackific/mcp-sdk-node/blob/main/src/jsonrpc/payload.ts#L146)

The common base every request's `params` object extends. (§3.7)

`_meta` is REQUIRED on request params because it conveys per-request protocol
state (protocol revision, client info, capabilities, etc.). Its full structure
(`RequestMetaObject`) and the key-naming rules are defined in §4 / S05.
(R-3.7-a)

`.passthrough()` allows method-specific params members to survive parse.
