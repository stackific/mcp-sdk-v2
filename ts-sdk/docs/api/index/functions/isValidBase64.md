[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isValidBase64

# Function: isValidBase64()

> **isValidBase64**(`s`): `boolean`

Defined in: [types/resource-contents.ts:19](https://github.com/stackific/mcp-sdk-node/blob/main/src/types/resource-contents.ts#L19)

Returns `true` when `s` contains only valid Base64 characters (including
optional `=` padding). Accepts both standard (`+/`) and URL-safe (`-_`)
variants so the SDK remains interoperable. (R-14.5-f, R-14.4.2-b, R-14.4.3-b)

## Parameters

### s

`string`

## Returns

`boolean`
