[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / PromptListChangedNotificationParamsSchema

# Variable: PromptListChangedNotificationParamsSchema

> `const` **PromptListChangedNotificationParamsSchema**: `ZodObject`\<\{ `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/prompts.ts:676](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/prompts.ts#L676)

The `params` of a `notifications/prompts/list_changed` notification: when
present it MAY carry ONLY a reserved `_meta` map and no prompt data. (§18.6,
R-18.6-c, AC-28.40)

`.passthrough()` preserves forward-compatible `_meta`-adjacent additions; the
notification itself carries no prompt payload.
