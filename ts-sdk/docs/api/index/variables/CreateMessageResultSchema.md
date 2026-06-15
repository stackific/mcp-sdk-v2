[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / CreateMessageResultSchema

# Variable: CreateMessageResultSchema

> `const` **CreateMessageResultSchema**: `ZodObject`\<\{ `role`: `ZodString`; `content`: `ZodUnknown`; `model`: `ZodString`; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `role`: `ZodString`; `content`: `ZodUnknown`; `model`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `role`: `ZodString`; `content`: `ZodUnknown`; `model`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/multi-round-trip.ts:395](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/multi-round-trip.ts#L395)

`CreateMessageResult` — client response to a `"sampling/createMessage"` input
request. Full shape is defined in §21 (S33, deprecated); the S17-owned
required fields are `role`, `content`, and `model`. (R-11.4-e)
