[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / assertSafeInteger

# Function: assertSafeInteger()

> **assertSafeInteger**(`n`): `void`

Defined in: [json/value.ts:64](https://github.com/stackific/mcp-sdk-node/blob/main/src/json/value.ts#L64)

Asserts that `n` is within the safe-integer range.
Senders MUST NOT emit identifier/counter values outside this range. (R-2.5-d)

## Parameters

### n

`number`

## Returns

`void`
