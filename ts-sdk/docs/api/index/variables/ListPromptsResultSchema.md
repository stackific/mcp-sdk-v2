[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ListPromptsResultSchema

# Variable: ListPromptsResultSchema

> `const` **ListPromptsResultSchema**: `ZodObject`\<\{ `resultType`: `ZodLiteral`\<`"complete"`\>; `prompts`: `ZodArray`\<`ZodObject`\<`object` & `object`, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>\>, `"many"`\>; `nextCursor`: `ZodOptional`\<`ZodString`\>; `ttlMs`: `ZodNumber`; `cacheScope`: `ZodEnum`\<\[`"public"`, `"private"`\]\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `resultType`: `ZodLiteral`\<`"complete"`\>; `prompts`: `ZodArray`\<`ZodObject`\<`object` & `object`, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>\>, `"many"`\>; `nextCursor`: `ZodOptional`\<`ZodString`\>; `ttlMs`: `ZodNumber`; `cacheScope`: `ZodEnum`\<\[`"public"`, `"private"`\]\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `resultType`: `ZodLiteral`\<`"complete"`\>; `prompts`: `ZodArray`\<`ZodObject`\<`object` & `object`, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>\>, `"many"`\>; `nextCursor`: `ZodOptional`\<`ZodString`\>; `ttlMs`: `ZodNumber`; `cacheScope`: `ZodEnum`\<\[`"public"`, `"private"`\]\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/prompts.ts:306](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/prompts.ts#L306)

The result of `prompts/list`: simultaneously a paginated result (§12), a
cacheable result (§13), and a result-typed result (§3). (§18.2)

Field constraints (R-18.2-d – R-18.2-q):
  - `prompts` REQUIRED `Prompt[]` — the page; MAY be empty (R-18.2-d, AC-28.12).
  - `nextCursor` OPTIONAL opaque token — when present the client MAY fetch the
    next page by setting `params.cursor` to it; treated as opaque (R-18.2-e –
    R-18.2-g, AC-28.13).
  - `ttlMs` REQUIRED non-negative integer (§13). `0` ⇒ immediately stale;
    positive ⇒ fresh that many ms after receipt (R-18.2-h – R-18.2-k). A
    negative value is rejected (AC-28.14).
  - `cacheScope` REQUIRED `"public" | "private"` (§13). `"private"` MUST NOT be
    served by a shared cache to a different user (R-18.2-l, R-18.2-m, AC-28.17).
  - `resultType` REQUIRED — `"complete"` for a completed list (R-18.2-n,
    R-18.2-o). Absence is treated as `"complete"` by the client (R-18.2-p — use
    [resolveListPromptsResultType](../functions/resolveListPromptsResultType.md)).
  - `_meta` OPTIONAL reserved metadata map (R-18.2-q).

`ttlMs`/`cacheScope` reuse the S19 schemas (`z.number().int().nonnegative()` /
`CacheScopeSchema`); `nextCursor`/`resultType`/`_meta` mirror the paginated/base
shapes. `.passthrough()` preserves forward-compatible additions.
