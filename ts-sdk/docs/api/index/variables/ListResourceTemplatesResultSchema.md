[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ListResourceTemplatesResultSchema

# Variable: ListResourceTemplatesResultSchema

> `const` **ListResourceTemplatesResultSchema**: `ZodIntersection`\<`ZodIntersection`\<`ZodObject`\<\{ `resultType`: `ZodString`; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `nextCursor`: `ZodOptional`\<`ZodString`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `resultType`: `ZodString`; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `nextCursor`: `ZodOptional`\<`ZodString`\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `resultType`: `ZodString`; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `nextCursor`: `ZodOptional`\<`ZodString`\>; \}, `ZodTypeAny`, `"passthrough"`\>\>, `ZodObject`\<\{ `resultType`: `ZodString`; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `ttlMs`: `ZodNumber`; `cacheScope`: `ZodEnum`\<\[`"public"`, `"private"`\]\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `resultType`: `ZodString`; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `ttlMs`: `ZodNumber`; `cacheScope`: `ZodEnum`\<\[`"public"`, `"private"`\]\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `resultType`: `ZodString`; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `ttlMs`: `ZodNumber`; `cacheScope`: `ZodEnum`\<\[`"public"`, `"private"`\]\>; \}, `ZodTypeAny`, `"passthrough"`\>\>\>, `ZodObject`\<\{ `resultType`: `ZodLiteral`\<`"complete"`\>; `resourceTemplates`: `ZodArray`\<`ZodObject`\<`object` & `object`, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>\>, `"many"`\>; \}, `"strip"`, `ZodTypeAny`, \{ `resultType`: `"complete"`; `resourceTemplates`: `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>[]; \}, \{ `resultType`: `"complete"`; `resourceTemplates`: `objectInputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>[]; \}\>\>

Defined in: [protocol/resources.ts:503](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/resources.ts#L503)

The result of `resources/templates/list`. Paginated (S18) and cacheable (S19);
the pagination/caching fields behave exactly as in [ListResourcesResultSchema](ListResourcesResultSchema.md).
(§17.3)

  - `resourceTemplates` REQUIRED `ResourceTemplate[]`; MAY be empty. (R-17.3-b)
  - `resultType`, `ttlMs`, `cacheScope` REQUIRED, as in `resources/list`. (R-17.3-c)
