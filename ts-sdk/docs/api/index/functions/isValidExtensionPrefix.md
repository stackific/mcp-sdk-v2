[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isValidExtensionPrefix

# Function: isValidExtensionPrefix()

> **isValidExtensionPrefix**(`prefix`): `boolean`

Defined in: [protocol/extensions.ts:57](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/extensions.ts#L57)

Returns `true` when `prefix` is a syntactically valid extension-identifier
prefix: one or more dot-separated labels (no trailing slash). (R-6.5-a – R-6.5-c)

Reverse-DNS notation (e.g. `com.example`) is RECOMMENDED but not enforced; any
dot-separated sequence of valid labels is accepted. (R-6.5-d)

## Parameters

### prefix

`string`

## Returns

`boolean`
