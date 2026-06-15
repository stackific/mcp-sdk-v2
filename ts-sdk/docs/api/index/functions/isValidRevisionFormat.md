[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isValidRevisionFormat

# Function: isValidRevisionFormat()

> **isValidRevisionFormat**(`revision`): `boolean`

Defined in: [protocol/meta.ts:170](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/meta.ts#L170)

Returns `true` when `revision` matches the `YYYY-MM-DD` format. (§5.1, R-5.2-b)

A `true` result does NOT mean the revision is supported — use
[isSupportedProtocolVersion](isSupportedProtocolVersion.md) for that. Format validity is a weaker,
pre-check condition on the identifier's shape.

## Parameters

### revision

`string`

## Returns

`boolean`
