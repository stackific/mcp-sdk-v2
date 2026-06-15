[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ResourceUpdatedNotificationParamsSchema

# Variable: ResourceUpdatedNotificationParamsSchema

> `const` **ResourceUpdatedNotificationParamsSchema**: `ZodObject`\<\{ `uri`: `ZodEffects`\<`ZodString`, `string`, `string`\>; `_meta`: `ZodIntersection`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>, `ZodObject`\<\{ `io.modelcontextprotocol/subscriptionId`: `ZodString`; \}, `"strip"`, `ZodTypeAny`, \{ `io.modelcontextprotocol/subscriptionId`: `string`; \}, \{ `io.modelcontextprotocol/subscriptionId`: `string`; \}\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `uri`: `ZodEffects`\<`ZodString`, `string`, `string`\>; `_meta`: `ZodIntersection`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>, `ZodObject`\<\{ `io.modelcontextprotocol/subscriptionId`: `ZodString`; \}, `"strip"`, `ZodTypeAny`, \{ `io.modelcontextprotocol/subscriptionId`: `string`; \}, \{ `io.modelcontextprotocol/subscriptionId`: `string`; \}\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `uri`: `ZodEffects`\<`ZodString`, `string`, `string`\>; `_meta`: `ZodIntersection`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>, `ZodObject`\<\{ `io.modelcontextprotocol/subscriptionId`: `ZodString`; \}, `"strip"`, `ZodTypeAny`, \{ `io.modelcontextprotocol/subscriptionId`: `string`; \}, \{ `io.modelcontextprotocol/subscriptionId`: `string`; \}\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/streaming.ts:324](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/streaming.ts#L324)

The S16-owned constraints on `notifications/resources/updated` params as they
appear on the stream. (§10.5)

The full payload shape is owned by S27 (§17.7); here we constrain only the two
properties §10.5 places on it:
  - `uri` REQUIRED, absolute URI string [RFC3986] (MAY be a sub-resource of a
    subscribed container URI). (R-10.5-i, R-10.5-j)
  - `_meta` carries the subscription id (correlate by id, not solely by `uri`).
    (R-10.5-k, R-10.4-a)

`.passthrough()` preserves the S27-owned members.
