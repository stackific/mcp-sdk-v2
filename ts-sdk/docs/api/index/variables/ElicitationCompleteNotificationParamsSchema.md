[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ElicitationCompleteNotificationParamsSchema

# Variable: ElicitationCompleteNotificationParamsSchema

> `const` **ElicitationCompleteNotificationParamsSchema**: `ZodObject`\<\{ `elicitationId`: `ZodString`; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `elicitationId`: `ZodString`; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `elicitationId`: `ZodString`; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/elicitation-form.ts:1020](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/elicitation-form.ts#L1020)

The `params` of an [ElicitationCompleteNotification](../type-aliases/ElicitationCompleteNotification.md): the
`elicitationId` that completed. (§20.6, R-20.6-b)
