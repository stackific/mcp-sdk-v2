[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / getExtensionSettings

# Function: getExtensionSettings()

> **getExtensionSettings**(`raw`, `identifier`): `Record`\<`string`, `unknown`\> \| `undefined`

Defined in: [protocol/extensions.ts:243](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/extensions.ts#L243)

Returns the settings object a peer advertised for `identifier`, or `undefined`
when the extension is not validly advertised (absent, `null`, or malformed).
(R-6.5-h, R-6.5-j)

The returned object MAY contain settings keys the receiving extension does not
define; those MUST be ignored by the extension, not rejected. (R-6.5-k,
R-6.6-e) Use [pickKnownSettings](pickKnownSettings.md) to project to the keys an extension
understands.

## Parameters

### raw

`unknown`

### identifier

`string`

## Returns

`Record`\<`string`, `unknown`\> \| `undefined`
