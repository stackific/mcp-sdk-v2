[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / extensionMetaKey

# Function: extensionMetaKey()

> **extensionMetaKey**(`identifier`, `name`): `string`

Defined in: [protocol/extension-mechanism.ts:333](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/extension-mechanism.ts#L333)

Builds a reserved `_meta` key under the extension's controlled vendor prefix.
(R-24.5-d) e.g. `("com.example/x", "trace") → "com.example/trace"`.

## Parameters

### identifier

`string`

### name

`string`

## Returns

`string`

## Throws

when `identifier` is malformed or `name` is not a valid
  `_meta` key name.
