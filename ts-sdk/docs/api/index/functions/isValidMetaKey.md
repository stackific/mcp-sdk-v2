[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isValidMetaKey

# Function: isValidMetaKey()

> **isValidMetaKey**(`key`): `boolean`

Defined in: [json/meta-key.ts:95](https://github.com/stackific/mcp-sdk-node/blob/main/src/json/meta-key.ts#L95)

Returns `true` when a `_meta` key is syntactically valid and its prefix
(if present) is not reserved.

Note: reserved bare keys (`traceparent`, `tracestate`, `baggage`) are
always valid — they are permitted by the spec. (R-2.6.2-i, R-2.6.2-j)

## Parameters

### key

`string`

## Returns

`boolean`
