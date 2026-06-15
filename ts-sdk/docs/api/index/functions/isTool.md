[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isTool

# Function: isTool()

> **isTool**(`value`): `value is objectOutputType<{ name: ZodString; title: ZodOptional<ZodString> } & { description: ZodOptional<ZodString>; inputSchema: ZodObject<{ type: ZodLiteral<"object"> }, "passthrough", ZodTypeAny, objectOutputType<{ type: ZodLiteral<"object"> }, ZodTypeAny, "passthrough">, objectInputType<{ type: ZodLiteral<"object"> }, ZodTypeAny, "passthrough">>; outputSchema: ZodOptional<ZodRecord<ZodString, ZodUnknown>>; annotations: ZodOptional<ZodObject<{ title: ZodOptional<ZodString>; readOnlyHint: ZodOptional<ZodBoolean>; destructiveHint: ZodOptional<ZodBoolean>; idempotentHint: ZodOptional<ZodBoolean>; openWorldHint: ZodOptional<ZodBoolean> }, "passthrough", ZodTypeAny, objectOutputType<{ title: ZodOptional<ZodString>; readOnlyHint: ZodOptional<ZodBoolean>; destructiveHint: ZodOptional<ZodBoolean>; idempotentHint: ZodOptional<ZodBoolean>; openWorldHint: ZodOptional<ZodBoolean> }, ZodTypeAny, "passthrough">, objectInputType<{ title: ZodOptional<ZodString>; readOnlyHint: ZodOptional<ZodBoolean>; destructiveHint: ZodOptional<ZodBoolean>; idempotentHint: ZodOptional<ZodBoolean>; openWorldHint: ZodOptional<ZodBoolean> }, ZodTypeAny, "passthrough">>>; icons: ZodOptional<ZodArray<ZodObject<{ src: ZodString; mimeType: ZodOptional<ZodString>; sizes: ZodOptional<ZodArray<ZodString, "many">>; theme: ZodOptional<ZodEnum<["light", "dark"]>> }, "passthrough", ZodTypeAny, objectOutputType<{ src: ZodString; mimeType: ZodOptional<ZodString>; sizes: ZodOptional<ZodArray<ZodString, "many">>; theme: ZodOptional<ZodEnum<[(...), (...)]>> }, ZodTypeAny, "passthrough">, objectInputType<{ src: ZodString; mimeType: ZodOptional<ZodString>; sizes: ZodOptional<ZodArray<ZodString, "many">>; theme: ZodOptional<ZodEnum<[(...), (...)]>> }, ZodTypeAny, "passthrough">>, "many">>; _meta: ZodOptional<ZodRecord<ZodString, ZodUnknown>> }, ZodTypeAny, "passthrough">`

Defined in: [protocol/tools.ts:594](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools.ts#L594)

Returns `true` when `value` is a well-formed `Tool`.

## Parameters

### value

`unknown`

## Returns

`value is objectOutputType<{ name: ZodString; title: ZodOptional<ZodString> } & { description: ZodOptional<ZodString>; inputSchema: ZodObject<{ type: ZodLiteral<"object"> }, "passthrough", ZodTypeAny, objectOutputType<{ type: ZodLiteral<"object"> }, ZodTypeAny, "passthrough">, objectInputType<{ type: ZodLiteral<"object"> }, ZodTypeAny, "passthrough">>; outputSchema: ZodOptional<ZodRecord<ZodString, ZodUnknown>>; annotations: ZodOptional<ZodObject<{ title: ZodOptional<ZodString>; readOnlyHint: ZodOptional<ZodBoolean>; destructiveHint: ZodOptional<ZodBoolean>; idempotentHint: ZodOptional<ZodBoolean>; openWorldHint: ZodOptional<ZodBoolean> }, "passthrough", ZodTypeAny, objectOutputType<{ title: ZodOptional<ZodString>; readOnlyHint: ZodOptional<ZodBoolean>; destructiveHint: ZodOptional<ZodBoolean>; idempotentHint: ZodOptional<ZodBoolean>; openWorldHint: ZodOptional<ZodBoolean> }, ZodTypeAny, "passthrough">, objectInputType<{ title: ZodOptional<ZodString>; readOnlyHint: ZodOptional<ZodBoolean>; destructiveHint: ZodOptional<ZodBoolean>; idempotentHint: ZodOptional<ZodBoolean>; openWorldHint: ZodOptional<ZodBoolean> }, ZodTypeAny, "passthrough">>>; icons: ZodOptional<ZodArray<ZodObject<{ src: ZodString; mimeType: ZodOptional<ZodString>; sizes: ZodOptional<ZodArray<ZodString, "many">>; theme: ZodOptional<ZodEnum<["light", "dark"]>> }, "passthrough", ZodTypeAny, objectOutputType<{ src: ZodString; mimeType: ZodOptional<ZodString>; sizes: ZodOptional<ZodArray<ZodString, "many">>; theme: ZodOptional<ZodEnum<[(...), (...)]>> }, ZodTypeAny, "passthrough">, objectInputType<{ src: ZodString; mimeType: ZodOptional<ZodString>; sizes: ZodOptional<ZodArray<ZodString, "many">>; theme: ZodOptional<ZodEnum<[(...), (...)]>> }, ZodTypeAny, "passthrough">>, "many">>; _meta: ZodOptional<ZodRecord<ZodString, ZodUnknown>> }, ZodTypeAny, "passthrough">`
