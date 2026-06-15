[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ToolListChangedNotificationParamsSchema

# Variable: ToolListChangedNotificationParamsSchema

> `const` **ToolListChangedNotificationParamsSchema**: `ZodObject`\<\{ `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/tools-call.ts:585](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools-call.ts#L585)

The `params` of a `notifications/tools/list_changed` notification: entirely
OPTIONAL — no required payload, MAY carry `_meta` and additional keys. (§16.8,
R-16.8-b)
