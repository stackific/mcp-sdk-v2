[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ResourceListChangedNotificationSchema

# Variable: ResourceListChangedNotificationSchema

> `const` **ResourceListChangedNotificationSchema**: `ZodObject`\<\{ `method`: `ZodLiteral`\<`"notifications/resources/list_changed"`\>; `params`: `ZodOptional`\<`ZodObject`\<\{ `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `method`: `ZodLiteral`\<`"notifications/resources/list_changed"`\>; `params`: `ZodOptional`\<`ZodObject`\<\{ `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `method`: `ZodLiteral`\<`"notifications/resources/list_changed"`\>; `params`: `ZodOptional`\<`ZodObject`\<\{ `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/resources-read.ts:415](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/resources-read.ts#L415)

The full `notifications/resources/list_changed` notification envelope — the
server-to-client signal that the set of available resources changed. `params`
is OPTIONAL and MAY carry only `_meta`. The server SHOULD emit this only when
it declared the `listChanged` sub-flag, and MUST NOT deliver it on a stream
whose §10 filter did not request `resourcesListChanged`. (§17.7, R-17.7-b,
R-17.7-c, R-17.7-e)

The DELIVERY-gating (which streams receive it) is owned by §10 / S16; this is
just the payload shape — a notification with NO required `params`.
