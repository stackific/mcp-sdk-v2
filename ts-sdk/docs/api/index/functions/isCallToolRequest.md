[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isCallToolRequest

# Function: isCallToolRequest()

> **isCallToolRequest**(`value`): `value is objectOutputType<{ jsonrpc: ZodLiteral<"2.0">; id: ZodUnion<[ZodString, ZodEffects<ZodNumber, number, number>]>; method: ZodLiteral<"tools/call">; params: ZodObject<{ name: ZodString; arguments: ZodOptional<ZodRecord<ZodString, ZodUnknown>>; inputResponses: ZodOptional<ZodRecord<ZodString, ZodUnknown>>; requestState: ZodOptional<ZodString>; _meta: ZodOptional<ZodRecord<ZodString, ZodUnknown>> }, "passthrough", ZodTypeAny, objectOutputType<{ name: ZodString; arguments: ZodOptional<ZodRecord<ZodString, ZodUnknown>>; inputResponses: ZodOptional<ZodRecord<ZodString, ZodUnknown>>; requestState: ZodOptional<ZodString>; _meta: ZodOptional<ZodRecord<ZodString, ZodUnknown>> }, ZodTypeAny, "passthrough">, objectInputType<{ name: ZodString; arguments: ZodOptional<ZodRecord<ZodString, ZodUnknown>>; inputResponses: ZodOptional<ZodRecord<ZodString, ZodUnknown>>; requestState: ZodOptional<ZodString>; _meta: ZodOptional<ZodRecord<ZodString, ZodUnknown>> }, ZodTypeAny, "passthrough">> }, ZodTypeAny, "passthrough">`

Defined in: [protocol/tools-call.ts:116](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools-call.ts#L116)

Returns `true` when `value` is a well-formed `tools/call` request. (R-16.5-a)

## Parameters

### value

`unknown`

## Returns

`value is objectOutputType<{ jsonrpc: ZodLiteral<"2.0">; id: ZodUnion<[ZodString, ZodEffects<ZodNumber, number, number>]>; method: ZodLiteral<"tools/call">; params: ZodObject<{ name: ZodString; arguments: ZodOptional<ZodRecord<ZodString, ZodUnknown>>; inputResponses: ZodOptional<ZodRecord<ZodString, ZodUnknown>>; requestState: ZodOptional<ZodString>; _meta: ZodOptional<ZodRecord<ZodString, ZodUnknown>> }, "passthrough", ZodTypeAny, objectOutputType<{ name: ZodString; arguments: ZodOptional<ZodRecord<ZodString, ZodUnknown>>; inputResponses: ZodOptional<ZodRecord<ZodString, ZodUnknown>>; requestState: ZodOptional<ZodString>; _meta: ZodOptional<ZodRecord<ZodString, ZodUnknown>> }, ZodTypeAny, "passthrough">, objectInputType<{ name: ZodString; arguments: ZodOptional<ZodRecord<ZodString, ZodUnknown>>; inputResponses: ZodOptional<ZodRecord<ZodString, ZodUnknown>>; requestState: ZodOptional<ZodString>; _meta: ZodOptional<ZodRecord<ZodString, ZodUnknown>> }, ZodTypeAny, "passthrough">> }, ZodTypeAny, "passthrough">`
