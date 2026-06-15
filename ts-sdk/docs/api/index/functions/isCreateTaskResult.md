[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isCreateTaskResult

# Function: isCreateTaskResult()

> **isCreateTaskResult**(`value`): `value is objectOutputType<{ taskId: ZodString; status: ZodEnum<["working", "input_required", "completed", "failed", "cancelled"]>; statusMessage: ZodOptional<ZodString>; createdAt: ZodString; lastUpdatedAt: ZodString; ttlMs: ZodUnion<[ZodNumber, ZodNull]>; pollIntervalMs: ZodOptional<ZodNumber> } & { resultType: ZodLiteral<"task">; _meta: ZodOptional<ZodRecord<ZodString, ZodUnknown>> }, ZodTypeAny, "passthrough">`

Defined in: [protocol/tasks.ts:393](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tasks.ts#L393)

Returns `true` when `value` is a well-formed [CreateTaskResult](../type-aliases/CreateTaskResult.md): a
`Result` with `resultType: "task"` carrying all `Task` fields. (§25.3,
R-25.3-c, AC-39.8)

A client that has declared the capability uses this to dispatch on the `"task"`
case after inspecting `resultType` on an eligible response. (R-25.3-c)

## Parameters

### value

`unknown`

## Returns

`value is objectOutputType<{ taskId: ZodString; status: ZodEnum<["working", "input_required", "completed", "failed", "cancelled"]>; statusMessage: ZodOptional<ZodString>; createdAt: ZodString; lastUpdatedAt: ZodString; ttlMs: ZodUnion<[ZodNumber, ZodNull]>; pollIntervalMs: ZodOptional<ZodNumber> } & { resultType: ZodLiteral<"task">; _meta: ZodOptional<ZodRecord<ZodString, ZodUnknown>> }, ZodTypeAny, "passthrough">`
