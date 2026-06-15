[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ListToolsResultSchema

# Variable: ListToolsResultSchema

> `const` **ListToolsResultSchema**: `ZodObject`\<\{ `resultType`: `ZodLiteral`\<`"complete"`\>; `tools`: `ZodArray`\<`ZodEffects`\<`ZodObject`\<`object` & `object`, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>\>, `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>\>, `"many"`\>; `nextCursor`: `ZodOptional`\<`ZodString`\>; `ttlMs`: `ZodNumber`; `cacheScope`: `ZodEnum`\<\[`"public"`, `"private"`\]\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `resultType`: `ZodLiteral`\<`"complete"`\>; `tools`: `ZodArray`\<`ZodEffects`\<`ZodObject`\<`object` & `object`, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>\>, `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>\>, `"many"`\>; `nextCursor`: `ZodOptional`\<`ZodString`\>; `ttlMs`: `ZodNumber`; `cacheScope`: `ZodEnum`\<\[`"public"`, `"private"`\]\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `resultType`: `ZodLiteral`\<`"complete"`\>; `tools`: `ZodArray`\<`ZodEffects`\<`ZodObject`\<`object` & `object`, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>\>, `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>\>, `"many"`\>; `nextCursor`: `ZodOptional`\<`ZodString`\>; `ttlMs`: `ZodNumber`; `cacheScope`: `ZodEnum`\<\[`"public"`, `"private"`\]\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/tools.ts:692](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools.ts#L692)

The result of `tools/list`. It is simultaneously a paginated result (§12,
`nextCursor`) and a cacheable result (§13, `ttlMs` / `cacheScope`), wrapping a
REQUIRED page of `Tool` definitions. (§16.2, R-16.2-b – R-16.2-n)

Field constraints:
  - `resultType` REQUIRED; for a tools list the value is `"complete"`. (R-16.2-m)
  - `tools` REQUIRED `Tool[]`: the page of definitions (MAY be empty). (R-16.2-b)
  - `nextCursor` OPTIONAL opaque token; absent ⇒ last page. (R-16.2-c)
  - `ttlMs` REQUIRED non-negative integer cache-freshness hint. (R-16.2-g, R-16.2-i)
  - `cacheScope` REQUIRED `"public"` | `"private"`. (R-16.2-j)
  - `_meta` OPTIONAL reserved metadata. (R-16.2-n)

Reuses S18's `CursorSchema` and S19's `CacheScopeSchema` rather than
re-declaring those shapes; `resultType` is narrowed to the `"complete"` literal.
