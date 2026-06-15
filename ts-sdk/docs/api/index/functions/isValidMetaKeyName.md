[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isValidMetaKeyName

# Function: isValidMetaKeyName()

> **isValidMetaKeyName**(`name`): `boolean`

Defined in: [json/meta-key.ts:67](https://github.com/stackific/mcp-sdk-node/blob/main/src/json/meta-key.ts#L67)

Returns `true` when `name` is a valid `_meta` key name.
An empty name is valid (when a prefix is present).
Non-empty names MUST begin and end with `[a-zA-Z0-9]`; interior
characters MAY be alphanumeric, hyphens, underscores, or dots.
(R-2.6.2-g, R-2.6.2-h, AC-02.18)

## Parameters

### name

`string`

## Returns

`boolean`
