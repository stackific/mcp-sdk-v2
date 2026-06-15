[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isStringContinuationId

# Function: isStringContinuationId()

> **isStringContinuationId**(`value`): `value is string`

Defined in: [protocol/stateless.ts:64](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/stateless.ts#L64)

Returns `true` when `value` is a string continuation identifier — the most
common form (e.g. pagination cursors, `requestState` tokens).

Clients MUST NOT parse, decode, or alter a string continuation id. (R-4.5-c)

## Parameters

### value

`unknown`

## Returns

`value is string`
