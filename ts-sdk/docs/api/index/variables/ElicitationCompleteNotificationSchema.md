[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ElicitationCompleteNotificationSchema

# Variable: ElicitationCompleteNotificationSchema

> `const` **ElicitationCompleteNotificationSchema**: `ZodObject`\<\{ `jsonrpc`: `ZodLiteral`\<`"2.0"`\>; `method`: `ZodLiteral`\<`"notifications/elicitation/complete"`\>; `params`: `ZodObject`\<\{ `elicitationId`: `ZodString`; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `elicitationId`: `ZodString`; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `elicitationId`: `ZodString`; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `jsonrpc`: `ZodLiteral`\<`"2.0"`\>; `method`: `ZodLiteral`\<`"notifications/elicitation/complete"`\>; `params`: `ZodObject`\<\{ `elicitationId`: `ZodString`; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `elicitationId`: `ZodString`; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `elicitationId`: `ZodString`; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `jsonrpc`: `ZodLiteral`\<`"2.0"`\>; `method`: `ZodLiteral`\<`"notifications/elicitation/complete"`\>; `params`: `ZodObject`\<\{ `elicitationId`: `ZodString`; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `elicitationId`: `ZodString`; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `elicitationId`: `ZodString`; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/elicitation-form.ts:1038](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/elicitation-form.ts#L1038)

The full `notifications/elicitation/complete` JSON-RPC notification: a
server→client signal that a URL-mode out-of-band interaction has finished.
A notification has no `id` and no response. (§20.6, R-20.6-a, R-20.6-b)
