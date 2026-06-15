[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isValidBaggage

# Function: isValidBaggage()

> **isValidBaggage**(`value`): `boolean`

Defined in: [json/meta-key.ts:219](https://github.com/stackific/mcp-sdk-node/blob/main/src/json/meta-key.ts#L219)

Returns `true` when `value` conforms to the W3C Baggage grammar.
Each list member must be `token "=" *baggage-octet` with optional properties.
(R-4.2-m, AC-05.15)

## Parameters

### value

`string`

## Returns

`boolean`
