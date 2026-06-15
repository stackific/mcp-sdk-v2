[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isToolListChangedNotification

# Function: isToolListChangedNotification()

> **isToolListChangedNotification**(`value`): `value is objectOutputType<{ jsonrpc: ZodLiteral<"2.0">; method: ZodLiteral<"notifications/tools/list_changed">; params: ZodOptional<ZodObject<{ _meta: ZodOptional<ZodRecord<ZodString, ZodUnknown>> }, "passthrough", ZodTypeAny, objectOutputType<{ _meta: ZodOptional<ZodRecord<ZodString, ZodUnknown>> }, ZodTypeAny, "passthrough">, objectInputType<{ _meta: ZodOptional<ZodRecord<ZodString, ZodUnknown>> }, ZodTypeAny, "passthrough">>> }, ZodTypeAny, "passthrough">`

Defined in: [protocol/tools-call.ts:617](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools-call.ts#L617)

Returns `true` when `value` is a well-formed list-changed notification.

## Parameters

### value

`unknown`

## Returns

`value is objectOutputType<{ jsonrpc: ZodLiteral<"2.0">; method: ZodLiteral<"notifications/tools/list_changed">; params: ZodOptional<ZodObject<{ _meta: ZodOptional<ZodRecord<ZodString, ZodUnknown>> }, "passthrough", ZodTypeAny, objectOutputType<{ _meta: ZodOptional<ZodRecord<ZodString, ZodUnknown>> }, ZodTypeAny, "passthrough">, objectInputType<{ _meta: ZodOptional<ZodRecord<ZodString, ZodUnknown>> }, ZodTypeAny, "passthrough">>> }, ZodTypeAny, "passthrough">`
