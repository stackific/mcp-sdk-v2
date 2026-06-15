[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / SubscriptionsListenRequestParamsSchema

# Variable: SubscriptionsListenRequestParamsSchema

> `const` **SubscriptionsListenRequestParamsSchema**: `ZodObject`\<`object` & `object`, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/streaming.ts:212](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/streaming.ts#L212)

The params of a `subscriptions/listen` request. (§10.2)

`notifications` is REQUIRED — the requested kinds are taken SOLELY from this
filter; there are no implicit/default subscriptions. (R-10.2-b, R-10.1-c)

Extends `RequestParamsSchema` (S04), so `_meta` is REQUIRED per-request metadata
(the §4 reserved request keys live there); the spec calls `_meta` OPTIONAL only
in the abstract §10.2 shape, but on the wire every client request carries it. (R-10.2-d)
