[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / SubscriptionsListenRequestSchema

# Variable: SubscriptionsListenRequestSchema

> `const` **SubscriptionsListenRequestSchema**: `ZodObject`\<\{ `jsonrpc`: `ZodLiteral`\<`"2.0"`\>; `id`: `ZodUnion`\<\[`ZodString`, `ZodEffects`\<`ZodNumber`, `number`, `number`\>\]\>; `method`: `ZodLiteral`\<`"subscriptions/listen"`\>; `params`: `ZodObject`\<`object` & `object`, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `jsonrpc`: `ZodLiteral`\<`"2.0"`\>; `id`: `ZodUnion`\<\[`ZodString`, `ZodEffects`\<`ZodNumber`, `number`, `number`\>\]\>; `method`: `ZodLiteral`\<`"subscriptions/listen"`\>; `params`: `ZodObject`\<`object` & `object`, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `jsonrpc`: `ZodLiteral`\<`"2.0"`\>; `id`: `ZodUnion`\<\[`ZodString`, `ZodEffects`\<`ZodNumber`, `number`, `number`\>\]\>; `method`: `ZodLiteral`\<`"subscriptions/listen"`\>; `params`: `ZodObject`\<`object` & `object`, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/streaming.ts:226](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/streaming.ts#L226)

The full `subscriptions/listen` request envelope. A JSON-RPC request (it has an
`id`, which doubles as the subscription identifier) carrying a REQUIRED `params`
object. (§10.2, R-10-a, R-10.1-a, R-10.1-b, R-10.2-a)
