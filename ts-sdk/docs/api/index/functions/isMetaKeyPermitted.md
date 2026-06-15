[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isMetaKeyPermitted

# Function: isMetaKeyPermitted()

> **isMetaKeyPermitted**(`key`): `boolean`

Defined in: [protocol/registries.ts:390](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/registries.ts#L390)

Returns `true` when `key` MAY appear in `_meta` — either because it is a
registry-reserved key (see [isReservedMetaKey](isReservedMetaKey.md)) or because it is an
extension-defined key carried under a valid non-reserved prefix, which the
§24 extension-mechanism and §4 namespacing rules permit. (R-AppC-a, R-AppC-j,
AC-46.3, AC-46.12)

A bare key that is neither reserved-by-exception nor prefixed is NOT permitted
(the spec requires a prefix for any non-reserved key).

## Parameters

### key

`string`

## Returns

`boolean`
