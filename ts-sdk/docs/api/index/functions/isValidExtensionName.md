[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isValidExtensionName

# Function: isValidExtensionName()

> **isValidExtensionName**(`name`): `boolean`

Defined in: [protocol/extensions.ts:69](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/extensions.ts#L69)

Returns `true` when `name` is a valid extension name (the part after the
slash). An empty name is permitted. (R-6.5-e, R-6.5-f)

A non-empty name MUST begin and end with an alphanumeric character; interior
characters MAY be hyphens, underscores, dots, or alphanumerics.

## Parameters

### name

`string`

## Returns

`boolean`
