[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isUpdateTaskRequest

# Function: isUpdateTaskRequest()

> **isUpdateTaskRequest**(`value`): `value is objectOutputType<{ jsonrpc: ZodLiteral<"2.0">; id: ZodUnion<[ZodString, ZodNumber]>; method: ZodLiteral<"tasks/update">; params: ZodObject<{ taskId: ZodString; inputResponses: ZodRecord<ZodString, ZodUnknown> }, "passthrough", ZodTypeAny, objectOutputType<{ taskId: ZodString; inputResponses: ZodRecord<ZodString, ZodUnknown> }, ZodTypeAny, "passthrough">, objectInputType<{ taskId: ZodString; inputResponses: ZodRecord<ZodString, ZodUnknown> }, ZodTypeAny, "passthrough">> }, ZodTypeAny, "passthrough">`

Defined in: [protocol/tasks-lifecycle.ts:285](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tasks-lifecycle.ts#L285)

Returns `true` when `value` is a well-formed `tasks/update` request — both
`taskId` and `inputResponses` present. (§25.8, R-25.8-a, AC-40.13)

## Parameters

### value

`unknown`

## Returns

`value is objectOutputType<{ jsonrpc: ZodLiteral<"2.0">; id: ZodUnion<[ZodString, ZodNumber]>; method: ZodLiteral<"tasks/update">; params: ZodObject<{ taskId: ZodString; inputResponses: ZodRecord<ZodString, ZodUnknown> }, "passthrough", ZodTypeAny, objectOutputType<{ taskId: ZodString; inputResponses: ZodRecord<ZodString, ZodUnknown> }, ZodTypeAny, "passthrough">, objectInputType<{ taskId: ZodString; inputResponses: ZodRecord<ZodString, ZodUnknown> }, ZodTypeAny, "passthrough">> }, ZodTypeAny, "passthrough">`
