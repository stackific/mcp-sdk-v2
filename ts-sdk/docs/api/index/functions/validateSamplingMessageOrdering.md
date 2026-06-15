[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / validateSamplingMessageOrdering

# Function: validateSamplingMessageOrdering()

> **validateSamplingMessageOrdering**(`messages`): `object`

Defined in: [protocol/sampling.ts:691](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/sampling.ts#L691)

Validates the §21.2.7 ordering/matching constraint across a `messages`
sequence: every `assistant` message containing one or more `ToolUseContent`
blocks MUST be followed IMMEDIATELY by a `user` message consisting ENTIRELY of
`ToolResultContent` blocks, with each tool use (`id: $id`) matched by a
corresponding result (`toolUseId: $id`), before any other message. Multiple
parallel tool uses are permitted. (R-21.2.7-b)

Also enforces the per-message exclusivity rule (R-21.2.7-a) on each `user`
message, so a single call validates both §21.2.7 constraints.

Returns `{ ok: true }` when the whole sequence is well-formed, else
`{ ok: false, reason, index }` pointing at the first offending message.

## Parameters

### messages

`objectOutputType`\<\{ `role`: `ZodEnum`\<\[`"user"`, `"assistant"`\]\>; `content`: `ZodUnion`\<\[`ZodUnion`\<\[`ZodObject`\<\{ `type`: `ZodLiteral`\<`"tool_use"`\>; `id`: `ZodString`; `name`: `ZodString`; `input`: `ZodRecord`\<`ZodString`, `ZodUnknown`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<..., ...\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `type`: `ZodLiteral`\<...\>; `id`: `ZodString`; `name`: `ZodString`; `input`: `ZodRecord`\<..., ...\>; `_meta`: `ZodOptional`\<...\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `type`: `ZodLiteral`\<...\>; `id`: `ZodString`; `name`: `ZodString`; `input`: `ZodRecord`\<..., ...\>; `_meta`: `ZodOptional`\<...\>; \}, `ZodTypeAny`, `"passthrough"`\>\>, `ZodObject`\<\{ `type`: `ZodLiteral`\<`"tool_result"`\>; `toolUseId`: `ZodString`; `content`: `ZodArray`\<`ZodUnion`\<...\>, `"many"`\>; `structuredContent`: `ZodOptional`\<`ZodUnknown`\>; `isError`: `ZodOptional`\<`ZodBoolean`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<..., ...\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `type`: `ZodLiteral`\<...\>; `toolUseId`: `ZodString`; `content`: `ZodArray`\<..., ...\>; `structuredContent`: `ZodOptional`\<...\>; `isError`: `ZodOptional`\<...\>; `_meta`: `ZodOptional`\<...\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `type`: `ZodLiteral`\<...\>; `toolUseId`: `ZodString`; `content`: `ZodArray`\<..., ...\>; `structuredContent`: `ZodOptional`\<...\>; `isError`: `ZodOptional`\<...\>; `_meta`: `ZodOptional`\<...\>; \}, `ZodTypeAny`, `"passthrough"`\>\>, `ZodObject`\<\{ `annotations`: `ZodOptional`\<`ZodObject`\<..., ..., ..., ..., ...\>\>; `_meta`: `ZodOptional`\<`ZodRecord`\<..., ...\>\>; `type`: `ZodLiteral`\<`"text"`\>; `text`: `ZodString`; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `annotations`: `ZodOptional`\<...\>; `_meta`: `ZodOptional`\<...\>; `type`: `ZodLiteral`\<...\>; `text`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `annotations`: `ZodOptional`\<...\>; `_meta`: `ZodOptional`\<...\>; `type`: `ZodLiteral`\<...\>; `text`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>\>, `ZodObject`\<\{ `annotations`: `ZodOptional`\<`ZodObject`\<..., ..., ..., ..., ...\>\>; `_meta`: `ZodOptional`\<`ZodRecord`\<..., ...\>\>; `type`: `ZodLiteral`\<`"image"`\>; `data`: `ZodEffects`\<`ZodString`, `string`, `string`\>; `mimeType`: `ZodString`; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `annotations`: `ZodOptional`\<...\>; `_meta`: `ZodOptional`\<...\>; `type`: `ZodLiteral`\<...\>; `data`: `ZodEffects`\<..., ..., ...\>; `mimeType`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `annotations`: `ZodOptional`\<...\>; `_meta`: `ZodOptional`\<...\>; `type`: `ZodLiteral`\<...\>; `data`: `ZodEffects`\<..., ..., ...\>; `mimeType`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>\>, `ZodObject`\<\{ `annotations`: `ZodOptional`\<`ZodObject`\<..., ..., ..., ..., ...\>\>; `_meta`: `ZodOptional`\<`ZodRecord`\<..., ...\>\>; `type`: `ZodLiteral`\<`"audio"`\>; `data`: `ZodEffects`\<`ZodString`, `string`, `string`\>; `mimeType`: `ZodString`; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `annotations`: `ZodOptional`\<...\>; `_meta`: `ZodOptional`\<...\>; `type`: `ZodLiteral`\<...\>; `data`: `ZodEffects`\<..., ..., ...\>; `mimeType`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `annotations`: `ZodOptional`\<...\>; `_meta`: `ZodOptional`\<...\>; `type`: `ZodLiteral`\<...\>; `data`: `ZodEffects`\<..., ..., ...\>; `mimeType`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>\>\]\>, `ZodArray`\<`ZodUnion`\<\[`ZodObject`\<\{ `type`: `ZodLiteral`\<...\>; `id`: `ZodString`; `name`: `ZodString`; `input`: `ZodRecord`\<..., ...\>; `_meta`: `ZodOptional`\<...\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `type`: ...; `id`: ...; `name`: ...; `input`: ...; `_meta`: ...; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `type`: ...; `id`: ...; `name`: ...; `input`: ...; `_meta`: ...; \}, `ZodTypeAny`, `"passthrough"`\>\>, `ZodObject`\<\{ `type`: `ZodLiteral`\<...\>; `toolUseId`: `ZodString`; `content`: `ZodArray`\<..., ...\>; `structuredContent`: `ZodOptional`\<...\>; `isError`: `ZodOptional`\<...\>; `_meta`: `ZodOptional`\<...\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `type`: ...; `toolUseId`: ...; `content`: ...; `structuredContent`: ...; `isError`: ...; `_meta`: ...; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `type`: ...; `toolUseId`: ...; `content`: ...; `structuredContent`: ...; `isError`: ...; `_meta`: ...; \}, `ZodTypeAny`, `"passthrough"`\>\>, `ZodObject`\<\{ `annotations`: `ZodOptional`\<...\>; `_meta`: `ZodOptional`\<...\>; `type`: `ZodLiteral`\<...\>; `text`: `ZodString`; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `annotations`: ...; `_meta`: ...; `type`: ...; `text`: ...; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `annotations`: ...; `_meta`: ...; `type`: ...; `text`: ...; \}, `ZodTypeAny`, `"passthrough"`\>\>, `ZodObject`\<\{ `annotations`: `ZodOptional`\<...\>; `_meta`: `ZodOptional`\<...\>; `type`: `ZodLiteral`\<...\>; `data`: `ZodEffects`\<..., ..., ...\>; `mimeType`: `ZodString`; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `annotations`: ...; `_meta`: ...; `type`: ...; `data`: ...; `mimeType`: ...; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `annotations`: ...; `_meta`: ...; `type`: ...; `data`: ...; `mimeType`: ...; \}, `ZodTypeAny`, `"passthrough"`\>\>, `ZodObject`\<\{ `annotations`: `ZodOptional`\<...\>; `_meta`: `ZodOptional`\<...\>; `type`: `ZodLiteral`\<...\>; `data`: `ZodEffects`\<..., ..., ...\>; `mimeType`: `ZodString`; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `annotations`: ...; `_meta`: ...; `type`: ...; `data`: ...; `mimeType`: ...; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `annotations`: ...; `_meta`: ...; `type`: ...; `data`: ...; `mimeType`: ...; \}, `ZodTypeAny`, `"passthrough"`\>\>\]\>, `"many"`\>\]\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>[]

## Returns

`object`

### ok

> **ok**: `boolean`

### reason?

> `optional` **reason?**: `string`

### index?

> `optional` **index?**: `number`
