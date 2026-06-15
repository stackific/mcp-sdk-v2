[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / plainStringForm

# Function: plainStringForm()

> **plainStringForm**(`value`): `string`

Defined in: [transport/http/param-encoding.ts:41](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/param-encoding.ts#L41)

Returns the per-type plain string form of a parameter value. (R-9.5.3-a)

## Parameters

### value

`string` \| `number` \| `boolean`

## Returns

`string`

## Throws

When `value` is an integer outside the safe range. (R-9.5.1-g)
