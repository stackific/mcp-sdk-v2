[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isExtensionSettings

# Function: isExtensionSettings()

> **isExtensionSettings**(`value`): `value is Record<string, unknown>`

Defined in: [protocol/extensions.ts:152](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/extensions.ts#L152)

Returns `true` when `value` is a non-null, non-array object — the only legal
shape for an extension settings value. An empty object `{}` qualifies (it is a
valid enabling declaration, not absence). (R-6.5-h)

## Parameters

### value

`unknown`

## Returns

`value is Record<string, unknown>`
