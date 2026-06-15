[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / parseExtensionId

# Function: parseExtensionId()

> **parseExtensionId**(`identifier`): [`ParsedExtensionId`](../interfaces/ParsedExtensionId.md) \| `undefined`

Defined in: [protocol/extensions.ts:91](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/extensions.ts#L91)

Splits an extension identifier at its FIRST slash into `prefix` and `name`.
Returns `undefined` when the string contains no slash at all — an identifier
without a separating slash has no prefix and is therefore malformed. (R-6.5-a)

Because the split is on the first slash, any later slashes (which would make
the name invalid) are retained in `name` so [isValidExtensionName](isValidExtensionName.md)
rejects them.

## Parameters

### identifier

`string`

## Returns

[`ParsedExtensionId`](../interfaces/ParsedExtensionId.md) \| `undefined`
