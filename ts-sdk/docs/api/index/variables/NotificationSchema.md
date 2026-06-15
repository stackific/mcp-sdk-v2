[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / NotificationSchema

# Variable: NotificationSchema

> `const` **NotificationSchema**: `ZodObject`\<\{ `method`: `ZodString`; `params`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `method`: `ZodString`; `params`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `method`: `ZodString`; `params`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/messages.ts:43](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/messages.ts#L43)

Abstract notification schema (§2.2, AC-01.7).

`method` is REQUIRED; `params` is OPTIONAL; there is NO `id`.
The absence of `id` is what distinguishes a notification from a request.
Receivers MUST NOT send any response to a notification (R-2.2-e).
