[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isValidContinuationId

# Function: isValidContinuationId()

> **isValidContinuationId**(`value`): `value is ContinuationId`

Defined in: [protocol/stateless.ts:48](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/stateless.ts#L48)

Returns `true` when `value` is a JSON-serializable value that may serve as a
continuation identifier. A continuation id must be able to round-trip through
JSON without loss; `undefined`, `Function`, `Symbol`, and `bigint` are excluded.

Used when a server mints a new continuation identifier (R-4.5-b).

## Parameters

### value

`unknown`

## Returns

`value is ContinuationId`
