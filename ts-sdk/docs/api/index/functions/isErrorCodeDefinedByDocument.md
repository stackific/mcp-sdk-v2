[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isErrorCodeDefinedByDocument

# Function: isErrorCodeDefinedByDocument()

> **isErrorCodeDefinedByDocument**(`code`): `boolean`

Defined in: [protocol/registries.ts:858](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/registries.ts#L858)

Returns `true` when `code` is a code the document already defines in Appendix
B — i.e. a code a custom definition MUST avoid. A `true` result means a custom
code that equals it is non-conformant. (R-AppB-a, AC-46.1)

This consults the full [ERROR\_CODE\_REGISTRY](../variables/ERROR_CODE_REGISTRY.md) so it catches every listed
code (including the resource-not-found legacy literal), not only the eight in
[RESERVED\_ERROR\_CODES](../variables/RESERVED_ERROR_CODES.md). The `-32001` HeaderMismatch code is included.

## Parameters

### code

`number`

## Returns

`boolean`
