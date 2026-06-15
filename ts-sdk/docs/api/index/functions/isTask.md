[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isTask

# Function: isTask()

> **isTask**(`value`): `value is objectOutputType<{ taskId: ZodString; status: ZodEnum<["working", "input_required", "completed", "failed", "cancelled"]>; statusMessage: ZodOptional<ZodString>; createdAt: ZodString; lastUpdatedAt: ZodString; ttlMs: ZodUnion<[ZodNumber, ZodNull]>; pollIntervalMs: ZodOptional<ZodNumber> }, ZodTypeAny, "passthrough">`

Defined in: [protocol/tasks.ts:359](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tasks.ts#L359)

Returns `true` when `value` is a well-formed [Task](../type-aliases/Task.md).

## Parameters

### value

`unknown`

## Returns

`value is objectOutputType<{ taskId: ZodString; status: ZodEnum<["working", "input_required", "completed", "failed", "cancelled"]>; statusMessage: ZodOptional<ZodString>; createdAt: ZodString; lastUpdatedAt: ZodString; ttlMs: ZodUnion<[ZodNumber, ZodNull]>; pollIntervalMs: ZodOptional<ZodNumber> }, ZodTypeAny, "passthrough">`
