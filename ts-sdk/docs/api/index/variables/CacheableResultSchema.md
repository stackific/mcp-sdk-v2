[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / CacheableResultSchema

# Variable: CacheableResultSchema

> `const` **CacheableResultSchema**: `ZodObject`\<\{ `resultType`: `ZodString`; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `ttlMs`: `ZodNumber`; `cacheScope`: `ZodEnum`\<\[`"public"`, `"private"`\]\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `resultType`: `ZodString`; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `ttlMs`: `ZodNumber`; `cacheScope`: `ZodEnum`\<\[`"public"`, `"private"`\]\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `resultType`: `ZodString`; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `ttlMs`: `ZodNumber`; `cacheScope`: `ZodEnum`\<\[`"public"`, `"private"`\]\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/caching.ts:55](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/caching.ts#L55)

A result that augments the base `Result` shape with two advisory caching
fields. (§13, R-13.1-a, R-13.1-d)

`ttlMs` (REQUIRED on cacheable results): non-negative integer freshness hint
in milliseconds. `0` means immediately stale; `N > 0` means fresh for N ms
from the client's local receive time. (R-13.2-a, R-13.2-e)

`cacheScope` (REQUIRED on cacheable results): `"public"` or `"private"`.
(R-13.1-d)

Both fields MUST appear together: a server MUST NOT emit one without the
other on results specified to carry caching hints. (R-13.1-g)

`.passthrough()` preserves method-specific payload members.
