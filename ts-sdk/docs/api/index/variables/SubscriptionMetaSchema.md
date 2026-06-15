[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / SubscriptionMetaSchema

# Variable: SubscriptionMetaSchema

> `const` **SubscriptionMetaSchema**: `ZodIntersection`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>, `ZodObject`\<\{ `io.modelcontextprotocol/subscriptionId`: `ZodString`; \}, `"strip"`, `ZodTypeAny`, \{ `io.modelcontextprotocol/subscriptionId`: `string`; \}, \{ `io.modelcontextprotocol/subscriptionId`: `string`; \}\>\>

Defined in: [protocol/streaming.ts:246](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/streaming.ts#L246)

The `_meta` fragment present on every subscription notification: it MUST contain
the reserved `io.modelcontextprotocol/subscriptionId` string key. (§10.4, R-10.4-a)

`.passthrough()` preserves any other `_meta` members. The schema requires the
reserved key to be a string (the request `id` serialized as a JSON string).
