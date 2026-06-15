[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / CreateMessageRequestParams

# Interface: CreateMessageRequestParams

Defined in: [protocol/sampling.ts:415](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/sampling.ts#L415)

`CreateMessageRequestParams` — parameters of the `sampling/createMessage`
input request. (§21.2.4)

`messages` is REQUIRED, ordered oldest→newest (R-21.2.4-a); the list SHOULD NOT
be retained between separate requests (R-21.2.4-b — enforced operationally by
never sharing arrays across requests, never implicitly here). `maxTokens` is
REQUIRED and is a hard upper bound the client MUST respect (R-21.2.4-h,
R-21.2.4-j). `modelPreferences`, `systemPrompt`, `temperature`, `stopSequences`,
`metadata` are OPTIONAL and advisory; the client MAY modify or ignore them
(R-21.2.4-c/d/g/k/l). `includeContext` defaults to `"none"`; the Deprecated
values are gated by `sampling.context` (R-21.2.4-e/f). `tools`/`toolChoice` are
OPTIONAL and gated by `sampling.tools` (R-21.2.4-m, R-21.2.4-n, R-21.2.4-o,
R-21.2.4-p).

Note: `maxTokens` is not bounded above structurally; the upper-bound obligation
(R-21.2.4-j) is a client sampling-time constraint enforced by
[clampToMaxTokens](../functions/clampToMaxTokens.md), not a schema bound.

The output type is written by hand as CreateMessageRequestParams and the
schema is annotated with it. Inferring the type from the schema overflows the
TypeScript serializer (TS7056) because the deep `SamplingContentSchema` union is
reachable through `messages`; the explicit annotation keeps it serializable
while leaving the runtime schema unchanged.

## Indexable

> \[`key`: `string`\]: `unknown`

Forward-compatible additional members preserved by `.passthrough()`.

## Properties

### messages

> **messages**: `objectOutputType`\<\{ `role`: `ZodEnum`\<\[`"user"`, `"assistant"`\]\>; `content`: `ZodUnion`\<\[`ZodUnion`\<\[`ZodObject`\<\{ `type`: `ZodLiteral`\<`"tool_use"`\>; `id`: `ZodString`; `name`: `ZodString`; `input`: `ZodRecord`\<`ZodString`, `ZodUnknown`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<..., ...\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `type`: `ZodLiteral`\<...\>; `id`: `ZodString`; `name`: `ZodString`; `input`: `ZodRecord`\<..., ...\>; `_meta`: `ZodOptional`\<...\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `type`: `ZodLiteral`\<...\>; `id`: `ZodString`; `name`: `ZodString`; `input`: `ZodRecord`\<..., ...\>; `_meta`: `ZodOptional`\<...\>; \}, `ZodTypeAny`, `"passthrough"`\>\>, `ZodObject`\<\{ `type`: `ZodLiteral`\<`"tool_result"`\>; `toolUseId`: `ZodString`; `content`: `ZodArray`\<`ZodUnion`\<...\>, `"many"`\>; `structuredContent`: `ZodOptional`\<`ZodUnknown`\>; `isError`: `ZodOptional`\<`ZodBoolean`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<..., ...\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `type`: `ZodLiteral`\<...\>; `toolUseId`: `ZodString`; `content`: `ZodArray`\<..., ...\>; `structuredContent`: `ZodOptional`\<...\>; `isError`: `ZodOptional`\<...\>; `_meta`: `ZodOptional`\<...\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `type`: `ZodLiteral`\<...\>; `toolUseId`: `ZodString`; `content`: `ZodArray`\<..., ...\>; `structuredContent`: `ZodOptional`\<...\>; `isError`: `ZodOptional`\<...\>; `_meta`: `ZodOptional`\<...\>; \}, `ZodTypeAny`, `"passthrough"`\>\>, `ZodObject`\<\{ `annotations`: `ZodOptional`\<`ZodObject`\<..., ..., ..., ..., ...\>\>; `_meta`: `ZodOptional`\<`ZodRecord`\<..., ...\>\>; `type`: `ZodLiteral`\<`"text"`\>; `text`: `ZodString`; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `annotations`: `ZodOptional`\<...\>; `_meta`: `ZodOptional`\<...\>; `type`: `ZodLiteral`\<...\>; `text`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `annotations`: `ZodOptional`\<...\>; `_meta`: `ZodOptional`\<...\>; `type`: `ZodLiteral`\<...\>; `text`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>\>, `ZodObject`\<\{ `annotations`: `ZodOptional`\<`ZodObject`\<..., ..., ..., ..., ...\>\>; `_meta`: `ZodOptional`\<`ZodRecord`\<..., ...\>\>; `type`: `ZodLiteral`\<`"image"`\>; `data`: `ZodEffects`\<`ZodString`, `string`, `string`\>; `mimeType`: `ZodString`; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `annotations`: `ZodOptional`\<...\>; `_meta`: `ZodOptional`\<...\>; `type`: `ZodLiteral`\<...\>; `data`: `ZodEffects`\<..., ..., ...\>; `mimeType`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `annotations`: `ZodOptional`\<...\>; `_meta`: `ZodOptional`\<...\>; `type`: `ZodLiteral`\<...\>; `data`: `ZodEffects`\<..., ..., ...\>; `mimeType`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>\>, `ZodObject`\<\{ `annotations`: `ZodOptional`\<`ZodObject`\<..., ..., ..., ..., ...\>\>; `_meta`: `ZodOptional`\<`ZodRecord`\<..., ...\>\>; `type`: `ZodLiteral`\<`"audio"`\>; `data`: `ZodEffects`\<`ZodString`, `string`, `string`\>; `mimeType`: `ZodString`; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `annotations`: `ZodOptional`\<...\>; `_meta`: `ZodOptional`\<...\>; `type`: `ZodLiteral`\<...\>; `data`: `ZodEffects`\<..., ..., ...\>; `mimeType`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `annotations`: `ZodOptional`\<...\>; `_meta`: `ZodOptional`\<...\>; `type`: `ZodLiteral`\<...\>; `data`: `ZodEffects`\<..., ..., ...\>; `mimeType`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>\>\]\>, `ZodArray`\<`ZodUnion`\<\[`ZodObject`\<\{ `type`: `ZodLiteral`\<...\>; `id`: `ZodString`; `name`: `ZodString`; `input`: `ZodRecord`\<..., ...\>; `_meta`: `ZodOptional`\<...\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `type`: ...; `id`: ...; `name`: ...; `input`: ...; `_meta`: ...; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `type`: ...; `id`: ...; `name`: ...; `input`: ...; `_meta`: ...; \}, `ZodTypeAny`, `"passthrough"`\>\>, `ZodObject`\<\{ `type`: `ZodLiteral`\<...\>; `toolUseId`: `ZodString`; `content`: `ZodArray`\<..., ...\>; `structuredContent`: `ZodOptional`\<...\>; `isError`: `ZodOptional`\<...\>; `_meta`: `ZodOptional`\<...\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `type`: ...; `toolUseId`: ...; `content`: ...; `structuredContent`: ...; `isError`: ...; `_meta`: ...; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `type`: ...; `toolUseId`: ...; `content`: ...; `structuredContent`: ...; `isError`: ...; `_meta`: ...; \}, `ZodTypeAny`, `"passthrough"`\>\>, `ZodObject`\<\{ `annotations`: `ZodOptional`\<...\>; `_meta`: `ZodOptional`\<...\>; `type`: `ZodLiteral`\<...\>; `text`: `ZodString`; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `annotations`: ...; `_meta`: ...; `type`: ...; `text`: ...; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `annotations`: ...; `_meta`: ...; `type`: ...; `text`: ...; \}, `ZodTypeAny`, `"passthrough"`\>\>, `ZodObject`\<\{ `annotations`: `ZodOptional`\<...\>; `_meta`: `ZodOptional`\<...\>; `type`: `ZodLiteral`\<...\>; `data`: `ZodEffects`\<..., ..., ...\>; `mimeType`: `ZodString`; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `annotations`: ...; `_meta`: ...; `type`: ...; `data`: ...; `mimeType`: ...; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `annotations`: ...; `_meta`: ...; `type`: ...; `data`: ...; `mimeType`: ...; \}, `ZodTypeAny`, `"passthrough"`\>\>, `ZodObject`\<\{ `annotations`: `ZodOptional`\<...\>; `_meta`: `ZodOptional`\<...\>; `type`: `ZodLiteral`\<...\>; `data`: `ZodEffects`\<..., ..., ...\>; `mimeType`: `ZodString`; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `annotations`: ...; `_meta`: ...; `type`: ...; `data`: ...; `mimeType`: ...; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `annotations`: ...; `_meta`: ...; `type`: ...; `data`: ...; `mimeType`: ...; \}, `ZodTypeAny`, `"passthrough"`\>\>\]\>, `"many"`\>\]\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>[]

Defined in: [protocol/sampling.ts:417](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/sampling.ts#L417)

REQUIRED conversation, oldest→newest. (R-21.2.4-a)

***

### modelPreferences?

> `optional` **modelPreferences?**: `objectOutputType`\<\{ `hints`: `ZodOptional`\<`ZodArray`\<`ZodObject`\<\{ `name`: `ZodOptional`\<`ZodString`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `name`: `ZodOptional`\<`ZodString`\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `name`: `ZodOptional`\<`ZodString`\>; \}, `ZodTypeAny`, `"passthrough"`\>\>, `"many"`\>\>; `costPriority`: `ZodOptional`\<`ZodNumber`\>; `speedPriority`: `ZodOptional`\<`ZodNumber`\>; `intelligencePriority`: `ZodOptional`\<`ZodNumber`\>; \}, `ZodTypeAny`, `"passthrough"`\>

Defined in: [protocol/sampling.ts:419](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/sampling.ts#L419)

OPTIONAL advisory model-selection preferences. (R-21.2.4-c)

***

### systemPrompt?

> `optional` **systemPrompt?**: `string`

Defined in: [protocol/sampling.ts:421](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/sampling.ts#L421)

OPTIONAL system prompt; client MAY modify/ignore. (R-21.2.4-d)

***

### includeContext?

> `optional` **includeContext?**: `"none"` \| `"thisServer"` \| `"allServers"`

Defined in: [protocol/sampling.ts:423](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/sampling.ts#L423)

OPTIONAL context-inclusion request; default `"none"`. (R-21.2.4-e/f)

***

### temperature?

> `optional` **temperature?**: `number`

Defined in: [protocol/sampling.ts:425](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/sampling.ts#L425)

OPTIONAL randomness control; client MAY modify/ignore. (R-21.2.4-g)

***

### maxTokens

> **maxTokens**: `number`

Defined in: [protocol/sampling.ts:427](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/sampling.ts#L427)

REQUIRED requested max tokens; a hard upper bound. (R-21.2.4-h, R-21.2.4-j)

***

### stopSequences?

> `optional` **stopSequences?**: `string`[]

Defined in: [protocol/sampling.ts:429](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/sampling.ts#L429)

OPTIONAL stop sequences; client MAY modify/ignore. (R-21.2.4-k)

***

### metadata?

> `optional` **metadata?**: `Record`\<`string`, `unknown`\>

Defined in: [protocol/sampling.ts:431](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/sampling.ts#L431)

OPTIONAL provider-specific pass-through; client MAY modify/ignore. (R-21.2.4-l)

***

### tools?

> `optional` **tools?**: `objectOutputType`\<\{ `name`: `ZodString`; `description`: `ZodOptional`\<`ZodString`\>; `inputSchema`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>[]

Defined in: [protocol/sampling.ts:433](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/sampling.ts#L433)

OPTIONAL request-scoped tools; gated by `sampling.tools`. (R-21.2.4-m, R-21.2.4-n)

***

### toolChoice?

> `optional` **toolChoice?**: `objectOutputType`\<\{ `mode`: `ZodOptional`\<`ZodEnum`\<\[`"auto"`, `"required"`, `"none"`\]\>\>; \}, `ZodTypeAny`, `"passthrough"`\>

Defined in: [protocol/sampling.ts:435](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/sampling.ts#L435)

OPTIONAL tool-use control; gated by `sampling.tools`; default `auto`. (R-21.2.4-o, R-21.2.4-p)
