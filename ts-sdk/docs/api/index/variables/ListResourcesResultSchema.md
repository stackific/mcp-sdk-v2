[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ListResourcesResultSchema

# Variable: ListResourcesResultSchema

> `const` **ListResourcesResultSchema**: `ZodIntersection`\<`ZodIntersection`\<`ZodObject`\<\{ `resultType`: `ZodString`; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `nextCursor`: `ZodOptional`\<`ZodString`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `resultType`: `ZodString`; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `nextCursor`: `ZodOptional`\<`ZodString`\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `resultType`: `ZodString`; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `nextCursor`: `ZodOptional`\<`ZodString`\>; \}, `ZodTypeAny`, `"passthrough"`\>\>, `ZodObject`\<\{ `resultType`: `ZodString`; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `ttlMs`: `ZodNumber`; `cacheScope`: `ZodEnum`\<\[`"public"`, `"private"`\]\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `resultType`: `ZodString`; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `ttlMs`: `ZodNumber`; `cacheScope`: `ZodEnum`\<\[`"public"`, `"private"`\]\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `resultType`: `ZodString`; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `ttlMs`: `ZodNumber`; `cacheScope`: `ZodEnum`\<\[`"public"`, `"private"`\]\>; \}, `ZodTypeAny`, `"passthrough"`\>\>\>, `ZodObject`\<\{ `resultType`: `ZodLiteral`\<`"complete"`\>; `resources`: `ZodArray`\<`ZodObject`\<`object` & `object`, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>\>, `"many"`\>; \}, `"strip"`, `ZodTypeAny`, \{ `resultType`: `"complete"`; `resources`: `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>[]; \}, \{ `resultType`: `"complete"`; `resources`: `objectInputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>[]; \}\>\>

Defined in: [protocol/resources.ts:455](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/resources.ts#L455)

The result of `resources/list`. It is BOTH a `PaginatedResult` (S18) and a
`CacheableResult` (S19), carrying a REQUIRED `resources` array. (§17.2)

  - `resources` REQUIRED `Resource[]`; MAY be empty. (R-17.2-b)
  - `nextCursor` OPTIONAL opaque cursor; absent ⇒ listing complete. The client
    MUST treat it as opaque and MUST NOT parse/construct it. (R-17.2-c – R-17.2-e)
  - `resultType` REQUIRED; `"complete"` for a list result. (R-17.2-f)
  - `ttlMs` REQUIRED `≥ 0` and `cacheScope` REQUIRED `"public" | "private"`. (R-17.2-g, R-17.2-h)
  - `_meta` OPTIONAL reserved metadata map. (R-17.2-i)

Built by intersecting the two reused base shapes and adding the list payload,
so the pagination/caching fields keep their single canonical definitions.
