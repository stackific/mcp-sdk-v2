[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / SubscriptionFilterSchema

# Variable: SubscriptionFilterSchema

> `const` **SubscriptionFilterSchema**: `ZodObject`\<\{ `toolsListChanged`: `ZodOptional`\<`ZodBoolean`\>; `promptsListChanged`: `ZodOptional`\<`ZodBoolean`\>; `resourcesListChanged`: `ZodOptional`\<`ZodBoolean`\>; `resourceSubscriptions`: `ZodOptional`\<`ZodArray`\<`ZodEffects`\<`ZodString`, `string`, `string`\>, `"many"`\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `toolsListChanged`: `ZodOptional`\<`ZodBoolean`\>; `promptsListChanged`: `ZodOptional`\<`ZodBoolean`\>; `resourcesListChanged`: `ZodOptional`\<`ZodBoolean`\>; `resourceSubscriptions`: `ZodOptional`\<`ZodArray`\<`ZodEffects`\<`ZodString`, `string`, `string`\>, `"many"`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `toolsListChanged`: `ZodOptional`\<`ZodBoolean`\>; `promptsListChanged`: `ZodOptional`\<`ZodBoolean`\>; `resourcesListChanged`: `ZodOptional`\<`ZodBoolean`\>; `resourceSubscriptions`: `ZodOptional`\<`ZodArray`\<`ZodEffects`\<`ZodString`, `string`, `string`\>, `"many"`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/streaming.ts:170](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/streaming.ts#L170)

The explicit opt-in describing exactly which change notifications the client
wants on this stream. Used both in the request (`notifications`) and, as the
honored subset, in the acknowledgement. (§10.2)

ALL fields are OPTIONAL; omitting a field (or `false`, or an absent/empty
`resourceSubscriptions`) means "not subscribing" to that kind. (R-10.2-j)
  - `toolsListChanged`     OPTIONAL boolean → `notifications/tools/list_changed`.   (R-10.2-e)
  - `promptsListChanged`   OPTIONAL boolean → `notifications/prompts/list_changed`. (R-10.2-f)
  - `resourcesListChanged` OPTIONAL boolean → `notifications/resources/list_changed`. (R-10.2-g)
  - `resourceSubscriptions` OPTIONAL array of absolute URI strings → per-resource
    `notifications/resources/updated`; absent/empty means none. (R-10.2-h, R-10.2-i)
