[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isUiResourceContents

# Function: isUiResourceContents()

> **isUiResourceContents**(`value`): value is objectOutputType\<\{ uri: ZodString; mimeType: ZodOptional\<ZodString\>; text: ZodString; \_meta: ZodOptional\<ZodRecord\<ZodString, ZodUnknown\>\> \}, ZodTypeAny, "passthrough"\> \| objectOutputType\<\{ uri: ZodString; mimeType: ZodOptional\<ZodString\>; blob: ZodEffects\<ZodString, string, string\>; \_meta: ZodOptional\<ZodRecord\<ZodString, ZodUnknown\>\> \}, ZodTypeAny, "passthrough"\>

Defined in: [protocol/ui.ts:822](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui.ts#L822)

Returns `true` when `value` is a well-formed UI resource `contents` entry. (§26.4)

## Parameters

### value

`unknown`

## Returns

value is objectOutputType\<\{ uri: ZodString; mimeType: ZodOptional\<ZodString\>; text: ZodString; \_meta: ZodOptional\<ZodRecord\<ZodString, ZodUnknown\>\> \}, ZodTypeAny, "passthrough"\> \| objectOutputType\<\{ uri: ZodString; mimeType: ZodOptional\<ZodString\>; blob: ZodEffects\<ZodString, string, string\>; \_meta: ZodOptional\<ZodRecord\<ZodString, ZodUnknown\>\> \}, ZodTypeAny, "passthrough"\>
