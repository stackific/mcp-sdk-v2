[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isTaskAcknowledgementResult

# Function: isTaskAcknowledgementResult()

> **isTaskAcknowledgementResult**(`value`): `value is objectOutputType<{ resultType: ZodLiteral<"complete">; _meta: ZodOptional<ZodRecord<ZodString, ZodUnknown>> }, ZodTypeAny, "passthrough">`

Defined in: [protocol/tasks-lifecycle.ts:448](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tasks-lifecycle.ts#L448)

Returns `true` when `value` is a well-formed task acknowledgement result —
`resultType: "complete"` (the shared `tasks/update` / `tasks/cancel` ack).
(R-25.8-j, R-25.9-e)

## Parameters

### value

`unknown`

## Returns

`value is objectOutputType<{ resultType: ZodLiteral<"complete">; _meta: ZodOptional<ZodRecord<ZodString, ZodUnknown>> }, ZodTypeAny, "passthrough">`
