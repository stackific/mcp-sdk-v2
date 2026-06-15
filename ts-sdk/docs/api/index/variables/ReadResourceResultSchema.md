[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ReadResourceResultSchema

# Variable: ReadResourceResultSchema

> `const` **ReadResourceResultSchema**: `ZodIntersection`\<`ZodObject`\<\{ `resultType`: `ZodString`; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `ttlMs`: `ZodNumber`; `cacheScope`: `ZodEnum`\<\[`"public"`, `"private"`\]\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `resultType`: `ZodString`; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `ttlMs`: `ZodNumber`; `cacheScope`: `ZodEnum`\<\[`"public"`, `"private"`\]\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `resultType`: `ZodString`; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `ttlMs`: `ZodNumber`; `cacheScope`: `ZodEnum`\<\[`"public"`, `"private"`\]\>; \}, `ZodTypeAny`, `"passthrough"`\>\>, `ZodObject`\<\{ `resultType`: `ZodLiteral`\<`"complete"`\>; `contents`: `ZodArray`\<`ZodEffects`\<`ZodUnion`\<\[`ZodObject`\<\{ `uri`: `ZodString`; `mimeType`: `ZodOptional`\<`ZodString`\>; `text`: `ZodString`; `_meta`: `ZodOptional`\<`ZodRecord`\<..., ...\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `uri`: `ZodString`; `mimeType`: `ZodOptional`\<...\>; `text`: `ZodString`; `_meta`: `ZodOptional`\<...\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `uri`: `ZodString`; `mimeType`: `ZodOptional`\<...\>; `text`: `ZodString`; `_meta`: `ZodOptional`\<...\>; \}, `ZodTypeAny`, `"passthrough"`\>\>, `ZodObject`\<\{ `uri`: `ZodString`; `mimeType`: `ZodOptional`\<`ZodString`\>; `blob`: `ZodEffects`\<`ZodString`, `string`, `string`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<..., ...\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `uri`: `ZodString`; `mimeType`: `ZodOptional`\<...\>; `blob`: `ZodEffects`\<..., ..., ...\>; `_meta`: `ZodOptional`\<...\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `uri`: `ZodString`; `mimeType`: `ZodOptional`\<...\>; `blob`: `ZodEffects`\<..., ..., ...\>; `_meta`: `ZodOptional`\<...\>; \}, `ZodTypeAny`, `"passthrough"`\>\>\]\>, `objectOutputType`\<\{ `uri`: `ZodString`; `mimeType`: `ZodOptional`\<`ZodString`\>; `text`: `ZodString`; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\> \| `objectOutputType`\<\{ `uri`: `ZodString`; `mimeType`: `ZodOptional`\<`ZodString`\>; `blob`: `ZodEffects`\<`ZodString`, `string`, `string`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `uri`: `ZodString`; `mimeType`: `ZodOptional`\<`ZodString`\>; `text`: `ZodString`; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\> \| `objectInputType`\<\{ `uri`: `ZodString`; `mimeType`: `ZodOptional`\<`ZodString`\>; `blob`: `ZodEffects`\<`ZodString`, `string`, `string`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>, `"many"`\>; \}, `"strip"`, `ZodTypeAny`, \{ `resultType`: `"complete"`; `contents`: (`objectOutputType`\<\{ `uri`: `ZodString`; `mimeType`: `ZodOptional`\<`ZodString`\>; `text`: `ZodString`; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\> \| `objectOutputType`\<\{ `uri`: `ZodString`; `mimeType`: `ZodOptional`\<`ZodString`\>; `blob`: `ZodEffects`\<`ZodString`, `string`, `string`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>)[]; \}, \{ `resultType`: `"complete"`; `contents`: (`objectInputType`\<\{ `uri`: `ZodString`; `mimeType`: `ZodOptional`\<`ZodString`\>; `text`: `ZodString`; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\> \| `objectInputType`\<\{ `uri`: `ZodString`; `mimeType`: `ZodOptional`\<`ZodString`\>; `blob`: `ZodEffects`\<`ZodString`, `string`, `string`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>)[]; \}\>\>

Defined in: [protocol/resources-read.ts:315](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/resources-read.ts#L315)

The result of a successful `resources/read`. It is a `CacheableResult` (S19)
carrying a REQUIRED `contents` array. (§17.5)

  - `contents` REQUIRED `(TextResourceContents | BlobResourceContents)[]`. MAY
    hold multiple entries (e.g. the files under a directory resource). Each
    entry is EITHER text or binary; a text entry sets `text` only when the
    item is representable as text, a binary entry carries base64 `blob`
    [RFC4648] and MUST NOT carry `text`. An entry's `uri` MAY differ from the
    requested `uri` (sub-resources). (R-17.5-i – R-17.5-p, R-17.5-s – R-17.5-v)
  - `resultType` REQUIRED; fixed to `"complete"` for a completed read. The
    `"input_required"` variant is the SEPARATE
    [InputRequiredReadResultSchema](InputRequiredReadResultSchema.md). (R-17.5-q)
  - `ttlMs` (≥ 0) and `cacheScope` (`"public" | "private"`) REQUIRED; governed
    by §13 / S19. (R-17.5-r)
  - `_meta` OPTIONAL reserved metadata map.

Built by intersecting the reused `CacheableResultSchema` with the read payload
and narrowing the inherited `resultType` to the `"complete"` literal, so a
list-style result with any other `resultType` is rejected. The element schema
reuses S21's `ResourceContentsSchema`, whose own `superRefine` already rejects
an entry carrying BOTH `text` and `blob`. (R-17.5-n)
