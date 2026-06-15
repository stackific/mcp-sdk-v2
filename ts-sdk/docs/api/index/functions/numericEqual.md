[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / numericEqual

# Function: numericEqual()

> **numericEqual**(`a`, `b`): `boolean`

Defined in: [json/value.ts:77](https://github.com/stackific/mcp-sdk-node/blob/main/src/json/value.ts#L77)

Returns `true` when `a` and `b` are numerically equal, regardless of their
textual JSON representation (e.g. `100 === 1e2`, `1 === 1.0`).
Two numerically equal JSON numbers MUST be treated as equal. (R-2.5-g, AC-02.15)

## Parameters

### a

`number`

### b

`number`

## Returns

`boolean`
