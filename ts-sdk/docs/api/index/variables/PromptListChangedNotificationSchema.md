[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / PromptListChangedNotificationSchema

# Variable: PromptListChangedNotificationSchema

> `const` **PromptListChangedNotificationSchema**: `ZodObject`\<\{ `jsonrpc`: `ZodLiteral`\<`"2.0"`\>; `method`: `ZodLiteral`\<`"notifications/prompts/list_changed"`\>; `params`: `ZodOptional`\<`ZodObject`\<\{ `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `jsonrpc`: `ZodLiteral`\<`"2.0"`\>; `method`: `ZodLiteral`\<`"notifications/prompts/list_changed"`\>; `params`: `ZodOptional`\<`ZodObject`\<\{ `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `jsonrpc`: `ZodLiteral`\<`"2.0"`\>; `method`: `ZodLiteral`\<`"notifications/prompts/list_changed"`\>; `params`: `ZodOptional`\<`ZodObject`\<\{ `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/prompts.ts:695](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/prompts.ts#L695)

The full `notifications/prompts/list_changed` notification: a one-way JSON-RPC
notification (no `id`, no response) with the exact method string and OPTIONAL
`_meta`-only `params`. (§18.6, R-18.6-b)

Reuses `PROMPTS_LIST_CHANGED_METHOD` from streaming (S16) — the canonical method
constant — rather than re-typing the literal.
