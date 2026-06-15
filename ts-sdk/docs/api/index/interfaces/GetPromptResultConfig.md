[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / GetPromptResultConfig

# Interface: GetPromptResultConfig

Defined in: [protocol/prompts.ts:467](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/prompts.ts#L467)

The server-supplied inputs to a completed `GetPromptResult`.

## Properties

### messages

> **messages**: readonly `objectOutputType`\<\{ `role`: `ZodEnum`\<\[`"user"`, `"assistant"`\]\>; `content`: `ZodUnion`\<\[`ZodObject`\<\{ `annotations`: `ZodOptional`\<`ZodObject`\<\{ `audience`: `ZodOptional`\<...\>; `priority`: `ZodOptional`\<...\>; `lastModified`: `ZodOptional`\<...\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `audience`: ...; `priority`: ...; `lastModified`: ...; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `audience`: ...; `priority`: ...; `lastModified`: ...; \}, `ZodTypeAny`, `"passthrough"`\>\>\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `type`: `ZodLiteral`\<`"text"`\>; `text`: `ZodString`; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `annotations`: `ZodOptional`\<`ZodObject`\<\{ `audience`: ...; `priority`: ...; `lastModified`: ...; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<..., ..., ...\>, `objectInputType`\<..., ..., ...\>\>\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `type`: `ZodLiteral`\<`"text"`\>; `text`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `annotations`: `ZodOptional`\<`ZodObject`\<\{ `audience`: ...; `priority`: ...; `lastModified`: ...; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<..., ..., ...\>, `objectInputType`\<..., ..., ...\>\>\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `type`: `ZodLiteral`\<`"text"`\>; `text`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>\>, `ZodObject`\<\{ `annotations`: `ZodOptional`\<`ZodObject`\<\{ `audience`: `ZodOptional`\<...\>; `priority`: `ZodOptional`\<...\>; `lastModified`: `ZodOptional`\<...\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `audience`: ...; `priority`: ...; `lastModified`: ...; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `audience`: ...; `priority`: ...; `lastModified`: ...; \}, `ZodTypeAny`, `"passthrough"`\>\>\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `type`: `ZodLiteral`\<`"image"`\>; `data`: `ZodEffects`\<`ZodString`, `string`, `string`\>; `mimeType`: `ZodString`; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `annotations`: `ZodOptional`\<`ZodObject`\<\{ `audience`: ...; `priority`: ...; `lastModified`: ...; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<..., ..., ...\>, `objectInputType`\<..., ..., ...\>\>\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `type`: `ZodLiteral`\<`"image"`\>; `data`: `ZodEffects`\<`ZodString`, `string`, `string`\>; `mimeType`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `annotations`: `ZodOptional`\<`ZodObject`\<\{ `audience`: ...; `priority`: ...; `lastModified`: ...; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<..., ..., ...\>, `objectInputType`\<..., ..., ...\>\>\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `type`: `ZodLiteral`\<`"image"`\>; `data`: `ZodEffects`\<`ZodString`, `string`, `string`\>; `mimeType`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>\>, `ZodObject`\<\{ `annotations`: `ZodOptional`\<`ZodObject`\<\{ `audience`: `ZodOptional`\<...\>; `priority`: `ZodOptional`\<...\>; `lastModified`: `ZodOptional`\<...\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `audience`: ...; `priority`: ...; `lastModified`: ...; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `audience`: ...; `priority`: ...; `lastModified`: ...; \}, `ZodTypeAny`, `"passthrough"`\>\>\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `type`: `ZodLiteral`\<`"audio"`\>; `data`: `ZodEffects`\<`ZodString`, `string`, `string`\>; `mimeType`: `ZodString`; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `annotations`: `ZodOptional`\<`ZodObject`\<\{ `audience`: ...; `priority`: ...; `lastModified`: ...; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<..., ..., ...\>, `objectInputType`\<..., ..., ...\>\>\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `type`: `ZodLiteral`\<`"audio"`\>; `data`: `ZodEffects`\<`ZodString`, `string`, `string`\>; `mimeType`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `annotations`: `ZodOptional`\<`ZodObject`\<\{ `audience`: ...; `priority`: ...; `lastModified`: ...; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<..., ..., ...\>, `objectInputType`\<..., ..., ...\>\>\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `type`: `ZodLiteral`\<`"audio"`\>; `data`: `ZodEffects`\<`ZodString`, `string`, `string`\>; `mimeType`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>\>\]\>; \}, `ZodTypeAny`, `"passthrough"`\>[]

Defined in: [protocol/prompts.ts:469](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/prompts.ts#L469)

REQUIRED ordered messages; one or several. (R-18.4-l, R-18.4-m)

***

### description?

> `optional` **description?**: `string`

Defined in: [protocol/prompts.ts:471](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/prompts.ts#L471)

OPTIONAL description of the rendered prompt. (§18.4)

***

### \_meta?

> `optional` **\_meta?**: `Record`\<`string`, `unknown`\>

Defined in: [protocol/prompts.ts:473](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/prompts.ts#L473)

OPTIONAL reserved metadata map.
