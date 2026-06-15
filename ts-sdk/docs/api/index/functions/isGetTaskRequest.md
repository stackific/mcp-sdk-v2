[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isGetTaskRequest

# Function: isGetTaskRequest()

> **isGetTaskRequest**(`value`): `value is objectOutputType<{ jsonrpc: ZodLiteral<"2.0">; id: ZodUnion<[ZodString, ZodNumber]>; method: ZodLiteral<"tasks/get">; params: ZodObject<{ taskId: ZodString }, "passthrough", ZodTypeAny, objectOutputType<{ taskId: ZodString }, ZodTypeAny, "passthrough">, objectInputType<{ taskId: ZodString }, ZodTypeAny, "passthrough">> }, ZodTypeAny, "passthrough">`

Defined in: [protocol/tasks-lifecycle.ts:181](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tasks-lifecycle.ts#L181)

Returns `true` when `value` is a well-formed `tasks/get` request. (R-25.7-a, R-25.7-b)

## Parameters

### value

`unknown`

## Returns

`value is objectOutputType<{ jsonrpc: ZodLiteral<"2.0">; id: ZodUnion<[ZodString, ZodNumber]>; method: ZodLiteral<"tasks/get">; params: ZodObject<{ taskId: ZodString }, "passthrough", ZodTypeAny, objectOutputType<{ taskId: ZodString }, ZodTypeAny, "passthrough">, objectInputType<{ taskId: ZodString }, ZodTypeAny, "passthrough">> }, ZodTypeAny, "passthrough">`
