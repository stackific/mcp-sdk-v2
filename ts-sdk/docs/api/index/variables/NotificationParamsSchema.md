[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / NotificationParamsSchema

# Variable: NotificationParamsSchema

> `const` **NotificationParamsSchema**: `ZodObject`\<\{ `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [jsonrpc/payload.ts:165](https://github.com/stackific/mcp-sdk-node/blob/main/src/jsonrpc/payload.ts#L165)

The common base every notification's `params` object extends. (§3.7)

`_meta` is OPTIONAL; when present, it follows the same key-naming and
reserved-key rules as other `_meta` objects (§4 / S05). (R-3.7-b)

`.passthrough()` allows notification-specific params members to survive parse.
