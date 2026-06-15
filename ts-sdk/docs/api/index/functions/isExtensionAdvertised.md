[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isExtensionAdvertised

# Function: isExtensionAdvertised()

> **isExtensionAdvertised**(`raw`, `identifier`): `boolean`

Defined in: [protocol/extensions.ts:228](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/extensions.ts#L228)

Returns `true` when a receiver should treat `identifier` as ADVERTISED by a
peer whose raw `extensions` map is `raw` — the key is present and maps to a
valid (non-`null`, object) settings value. (R-6.5-h, R-6.5-j)

A `null`-valued or otherwise-malformed entry is treated as not advertised.

## Parameters

### raw

`unknown`

### identifier

`string`

## Returns

`boolean`
