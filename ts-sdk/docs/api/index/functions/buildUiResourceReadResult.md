[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildUiResourceReadResult

# Function: buildUiResourceReadResult()

> **buildUiResourceReadResult**(`contents`, `cache`): `object`

Defined in: [protocol/ui.ts:905](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui.ts#L905)

Builds the result object a server returns from `resources/read` for a UI
resource: a complete, cacheable result carrying the single UI
`contents` entry. (§26.4)

The result mirrors the S27 `ReadResourceResult` shape used in the §26.4 wire
example: `resultType: "complete"`, a `contents` array, and the REQUIRED
`ttlMs`/`cacheScope` cache fields. The full `ReadResourceResult` schema and
its caching semantics are owned by S19/S27; this builder only assembles the
UI-specific content into that shape.

## Parameters

### contents

`objectOutputType`\<\{ `uri`: `ZodString`; `mimeType`: `ZodOptional`\<`ZodString`\>; `text`: `ZodString`; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\> \| `objectOutputType`\<\{ `uri`: `ZodString`; `mimeType`: `ZodOptional`\<`ZodString`\>; `blob`: `ZodEffects`\<`ZodString`, `string`, `string`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>

The UI resource `contents` entry (e.g. from
  [buildUiResourceContents](buildUiResourceContents.md)).

### cache

The REQUIRED cache fields (`ttlMs` non-negative integer,
  `cacheScope`).

#### ttlMs

`number`

#### cacheScope

`"public"` \| `"private"`

## Returns

`object`

### resultType

> **resultType**: `"complete"`

### contents

> **contents**: (`objectOutputType`\<\{ `uri`: `ZodString`; `mimeType`: `ZodOptional`\<`ZodString`\>; `text`: `ZodString`; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\> \| `objectOutputType`\<\{ `uri`: `ZodString`; `mimeType`: `ZodOptional`\<`ZodString`\>; `blob`: `ZodEffects`\<`ZodString`, `string`, `string`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>)[]

### ttlMs

> **ttlMs**: `number`

### cacheScope

> **cacheScope**: `"public"` \| `"private"`
