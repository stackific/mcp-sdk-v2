[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isValidExtensionsMap

# Function: isValidExtensionsMap()

> **isValidExtensionsMap**(`map`): `map is Record<string, Record<string, unknown>>`

Defined in: [protocol/extensions.ts:183](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/extensions.ts#L183)

Returns `true` when `map` is a valid producer-built `extensions` map: every
value is a settings object and no value is `null`. (R-6.5-i)

## Parameters

### map

`unknown`

## Returns

`map is Record<string, Record<string, unknown>>`
