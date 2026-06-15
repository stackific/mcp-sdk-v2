[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isToolUseContent

# Function: isToolUseContent()

> **isToolUseContent**(`block`): `block is objectOutputType<{ type: ZodLiteral<"tool_use">; id: ZodString; name: ZodString; input: ZodRecord<ZodString, ZodUnknown>; _meta: ZodOptional<ZodRecord<ZodString, ZodUnknown>> }, ZodTypeAny, "passthrough">`

Defined in: [protocol/sampling.ts:150](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/sampling.ts#L150)

Returns `true` when `block` is a `tool_use` content block.

## Parameters

### block

`unknown`

## Returns

`block is objectOutputType<{ type: ZodLiteral<"tool_use">; id: ZodString; name: ZodString; input: ZodRecord<ZodString, ZodUnknown>; _meta: ZodOptional<ZodRecord<ZodString, ZodUnknown>> }, ZodTypeAny, "passthrough">`
