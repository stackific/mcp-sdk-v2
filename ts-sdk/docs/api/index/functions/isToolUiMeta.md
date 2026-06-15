[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isToolUiMeta

# Function: isToolUiMeta()

> **isToolUiMeta**(`value`): `value is objectOutputType<{ resourceUri: ZodEffects<ZodString, string, string>; visibility: ZodOptional<ZodArray<ZodEnum<["model", "app"]>, "many">> }, ZodTypeAny, "passthrough">`

Defined in: [protocol/ui.ts:468](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui.ts#L468)

Returns `true` when `value` is a well-formed [ToolUiMeta](../type-aliases/ToolUiMeta.md). (§26.3)

## Parameters

### value

`unknown`

## Returns

`value is objectOutputType<{ resourceUri: ZodEffects<ZodString, string, string>; visibility: ZodOptional<ZodArray<ZodEnum<["model", "app"]>, "many">> }, ZodTypeAny, "passthrough">`
