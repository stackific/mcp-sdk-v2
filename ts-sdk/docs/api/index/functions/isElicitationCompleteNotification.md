[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isElicitationCompleteNotification

# Function: isElicitationCompleteNotification()

> **isElicitationCompleteNotification**(`value`): `value is objectOutputType<{ jsonrpc: ZodLiteral<"2.0">; method: ZodLiteral<"notifications/elicitation/complete">; params: ZodObject<{ elicitationId: ZodString; _meta: ZodOptional<ZodRecord<ZodString, ZodUnknown>> }, "passthrough", ZodTypeAny, objectOutputType<{ elicitationId: ZodString; _meta: ZodOptional<ZodRecord<ZodString, ZodUnknown>> }, ZodTypeAny, "passthrough">, objectInputType<{ elicitationId: ZodString; _meta: ZodOptional<ZodRecord<ZodString, ZodUnknown>> }, ZodTypeAny, "passthrough">> }, ZodTypeAny, "passthrough">`

Defined in: [protocol/elicitation-form.ts:1051](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/elicitation-form.ts#L1051)

Returns `true` when `value` is a well-formed elicitation-complete notification.

## Parameters

### value

`unknown`

## Returns

`value is objectOutputType<{ jsonrpc: ZodLiteral<"2.0">; method: ZodLiteral<"notifications/elicitation/complete">; params: ZodObject<{ elicitationId: ZodString; _meta: ZodOptional<ZodRecord<ZodString, ZodUnknown>> }, "passthrough", ZodTypeAny, objectOutputType<{ elicitationId: ZodString; _meta: ZodOptional<ZodRecord<ZodString, ZodUnknown>> }, ZodTypeAny, "passthrough">, objectInputType<{ elicitationId: ZodString; _meta: ZodOptional<ZodRecord<ZodString, ZodUnknown>> }, ZodTypeAny, "passthrough">> }, ZodTypeAny, "passthrough">`
