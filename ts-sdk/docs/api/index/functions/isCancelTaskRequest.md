[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isCancelTaskRequest

# Function: isCancelTaskRequest()

> **isCancelTaskRequest**(`value`): `value is objectOutputType<{ jsonrpc: ZodLiteral<"2.0">; id: ZodUnion<[ZodString, ZodNumber]>; method: ZodLiteral<"tasks/cancel">; params: ZodObject<{ taskId: ZodString }, "passthrough", ZodTypeAny, objectOutputType<{ taskId: ZodString }, ZodTypeAny, "passthrough">, objectInputType<{ taskId: ZodString }, ZodTypeAny, "passthrough">> }, ZodTypeAny, "passthrough">`

Defined in: [protocol/tasks-lifecycle.ts:399](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tasks-lifecycle.ts#L399)

Returns `true` when `value` is a well-formed `tasks/cancel` request. (§25.9, R-25.9-b, AC-40.24)

## Parameters

### value

`unknown`

## Returns

`value is objectOutputType<{ jsonrpc: ZodLiteral<"2.0">; id: ZodUnion<[ZodString, ZodNumber]>; method: ZodLiteral<"tasks/cancel">; params: ZodObject<{ taskId: ZodString }, "passthrough", ZodTypeAny, objectOutputType<{ taskId: ZodString }, ZodTypeAny, "passthrough">, objectInputType<{ taskId: ZodString }, ZodTypeAny, "passthrough">> }, ZodTypeAny, "passthrough">`
