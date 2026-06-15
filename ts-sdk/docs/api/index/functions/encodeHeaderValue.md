[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / encodeHeaderValue

# Function: encodeHeaderValue()

> **encodeHeaderValue**(`value`): `string`

Defined in: [transport/http/param-encoding.ts:103](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/param-encoding.ts#L103)

Encodes a parameter value into its header-value form. (§9.5.3)

Returns the plain per-type string when it is safe ASCII; otherwise the
`=?base64?{payload}?=` sentinel form. (R-9.5.3-a, R-9.5.3-b, R-9.5.3-e)

## Parameters

### value

`string` \| `number` \| `boolean`

## Returns

`string`

## Throws

When `value` is an out-of-range annotated integer.
