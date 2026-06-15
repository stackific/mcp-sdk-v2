[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isInputRequiredResult

# Function: isInputRequiredResult()

> **isInputRequiredResult**(`result`): `result is objectOutputType<{ resultType: ZodLiteral<"input_required">; inputRequests: ZodOptional<ZodRecord<ZodString, ZodDiscriminatedUnion<"method", [ZodObject<{ method: ZodLiteral<"elicitation/create">; params: ZodRecord<ZodString, ZodUnknown> }, "passthrough", ZodTypeAny, objectOutputType<{ method: ZodLiteral<"elicitation/create">; params: ZodRecord<ZodString, ZodUnknown> }, ZodTypeAny, "passthrough">, objectInputType<{ method: ZodLiteral<"elicitation/create">; params: ZodRecord<ZodString, ZodUnknown> }, ZodTypeAny, "passthrough">>, ZodObject<{ method: ZodLiteral<"roots/list">; params: ZodOptional<ZodRecord<ZodString, ZodUnknown>> }, "passthrough", ZodTypeAny, objectOutputType<{ method: ZodLiteral<"roots/list">; params: ZodOptional<ZodRecord<(...), (...)>> }, ZodTypeAny, "passthrough">, objectInputType<{ method: ZodLiteral<"roots/list">; params: ZodOptional<ZodRecord<(...), (...)>> }, ZodTypeAny, "passthrough">>, ZodObject<{ method: ZodLiteral<"sampling/createMessage">; params: ZodRecord<ZodString, ZodUnknown> }, "passthrough", ZodTypeAny, objectOutputType<{ method: ZodLiteral<"sampling/createMessage">; params: ZodRecord<ZodString, ZodUnknown> }, ZodTypeAny, "passthrough">, objectInputType<{ method: ZodLiteral<"sampling/createMessage">; params: ZodRecord<ZodString, ZodUnknown> }, ZodTypeAny, "passthrough">>]>>>; requestState: ZodOptional<ZodString>; _meta: ZodOptional<ZodRecord<ZodString, ZodUnknown>> }, ZodTypeAny, "passthrough">`

Defined in: [protocol/multi-round-trip.ts:155](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/multi-round-trip.ts#L155)

Returns `true` when `result` is a well-formed `InputRequiredResult`.

## Parameters

### result

`unknown`

## Returns

`result is objectOutputType<{ resultType: ZodLiteral<"input_required">; inputRequests: ZodOptional<ZodRecord<ZodString, ZodDiscriminatedUnion<"method", [ZodObject<{ method: ZodLiteral<"elicitation/create">; params: ZodRecord<ZodString, ZodUnknown> }, "passthrough", ZodTypeAny, objectOutputType<{ method: ZodLiteral<"elicitation/create">; params: ZodRecord<ZodString, ZodUnknown> }, ZodTypeAny, "passthrough">, objectInputType<{ method: ZodLiteral<"elicitation/create">; params: ZodRecord<ZodString, ZodUnknown> }, ZodTypeAny, "passthrough">>, ZodObject<{ method: ZodLiteral<"roots/list">; params: ZodOptional<ZodRecord<ZodString, ZodUnknown>> }, "passthrough", ZodTypeAny, objectOutputType<{ method: ZodLiteral<"roots/list">; params: ZodOptional<ZodRecord<(...), (...)>> }, ZodTypeAny, "passthrough">, objectInputType<{ method: ZodLiteral<"roots/list">; params: ZodOptional<ZodRecord<(...), (...)>> }, ZodTypeAny, "passthrough">>, ZodObject<{ method: ZodLiteral<"sampling/createMessage">; params: ZodRecord<ZodString, ZodUnknown> }, "passthrough", ZodTypeAny, objectOutputType<{ method: ZodLiteral<"sampling/createMessage">; params: ZodRecord<ZodString, ZodUnknown> }, ZodTypeAny, "passthrough">, objectInputType<{ method: ZodLiteral<"sampling/createMessage">; params: ZodRecord<ZodString, ZodUnknown> }, ZodTypeAny, "passthrough">>]>>>; requestState: ZodOptional<ZodString>; _meta: ZodOptional<ZodRecord<ZodString, ZodUnknown>> }, ZodTypeAny, "passthrough">`
