[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / CompleteResultSchema

# Variable: CompleteResultSchema

> `const` **CompleteResultSchema**: `ZodObject`\<\{ `resultType`: `ZodString`; `completion`: `ZodObject`\<\{ `values`: `ZodArray`\<`ZodString`, `"many"`\>; `total`: `ZodOptional`\<`ZodNumber`\>; `hasMore`: `ZodOptional`\<`ZodBoolean`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `values`: `ZodArray`\<`ZodString`, `"many"`\>; `total`: `ZodOptional`\<`ZodNumber`\>; `hasMore`: `ZodOptional`\<`ZodBoolean`\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `values`: `ZodArray`\<`ZodString`, `"many"`\>; `total`: `ZodOptional`\<`ZodNumber`\>; `hasMore`: `ZodOptional`\<`ZodBoolean`\>; \}, `ZodTypeAny`, `"passthrough"`\>\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `resultType`: `ZodString`; `completion`: `ZodObject`\<\{ `values`: `ZodArray`\<`ZodString`, `"many"`\>; `total`: `ZodOptional`\<`ZodNumber`\>; `hasMore`: `ZodOptional`\<`ZodBoolean`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `values`: `ZodArray`\<`ZodString`, `"many"`\>; `total`: `ZodOptional`\<`ZodNumber`\>; `hasMore`: `ZodOptional`\<`ZodBoolean`\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `values`: `ZodArray`\<`ZodString`, `"many"`\>; `total`: `ZodOptional`\<`ZodNumber`\>; `hasMore`: `ZodOptional`\<`ZodBoolean`\>; \}, `ZodTypeAny`, `"passthrough"`\>\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `resultType`: `ZodString`; `completion`: `ZodObject`\<\{ `values`: `ZodArray`\<`ZodString`, `"many"`\>; `total`: `ZodOptional`\<`ZodNumber`\>; `hasMore`: `ZodOptional`\<`ZodBoolean`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `values`: `ZodArray`\<`ZodString`, `"many"`\>; `total`: `ZodOptional`\<`ZodNumber`\>; `hasMore`: `ZodOptional`\<`ZodBoolean`\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `values`: `ZodArray`\<`ZodString`, `"many"`\>; `total`: `ZodOptional`\<`ZodNumber`\>; `hasMore`: `ZodOptional`\<`ZodBoolean`\>; \}, `ZodTypeAny`, `"passthrough"`\>\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/completion.ts:414](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/completion.ts#L414)

The result of a successful `completion/complete`. (§19.4)

  - `completion` REQUIRED — the [CompletionObject](../type-aliases/CompletionObject.md) of suggestions.
    (R-19.4-a)
  - `resultType` REQUIRED — `"complete"` for a successful completion; a server
    MUST include it, and a client receiving a result that omits it MUST treat
    the absent field as `"complete"` (use [resolveCompleteResultType](../functions/resolveCompleteResultType.md)).
    (R-19.4-j, R-19.4-k, R-19.4-l)
  - `_meta` OPTIONAL — reserved result metadata (§4).

Reuses the §3.6 base `ResultTypeSchema` (S04) for the discriminator.
`.passthrough()` preserves forward-compatible additions.
