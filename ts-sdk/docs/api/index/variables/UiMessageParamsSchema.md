[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / UiMessageParamsSchema

# Variable: UiMessageParamsSchema

> `const` **UiMessageParamsSchema**: `ZodObject`\<\{ `role`: `ZodLiteral`\<`"user"`\>; `content`: `ZodObject`\<\{ `type`: `ZodLiteral`\<`"text"`\>; `text`: `ZodString`; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `type`: `ZodLiteral`\<`"text"`\>; `text`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `type`: `ZodLiteral`\<`"text"`\>; `text`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `role`: `ZodLiteral`\<`"user"`\>; `content`: `ZodObject`\<\{ `type`: `ZodLiteral`\<`"text"`\>; `text`: `ZodString`; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `type`: `ZodLiteral`\<`"text"`\>; `text`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `type`: `ZodLiteral`\<`"text"`\>; `text`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `role`: `ZodLiteral`\<`"user"`\>; `content`: `ZodObject`\<\{ `type`: `ZodLiteral`\<`"text"`\>; `text`: `ZodString`; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `type`: `ZodLiteral`\<`"text"`\>; `text`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `type`: `ZodLiteral`\<`"text"`\>; `text`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/ui-host.ts:554](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui-host.ts#L554)

`UiMessageParams` — params of `ui/message` (insert a message into the
conversation). `role` is always `"user"`; `content` is a single text block.
Result is an empty object `{}`. (§26.5.3)
