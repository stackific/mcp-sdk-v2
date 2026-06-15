[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / parseScopeSet

# Function: parseScopeSet()

> **parseScopeSet**(`scope`): `string`[]

Defined in: [protocol/authorization-registration.ts:733](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L733)

Splits a space-delimited scope string into a deduplicated, order-preserving list.
Empty/whitespace-only input yields `[]`.

## Parameters

### scope

`string` \| `undefined`

A space-delimited scope string, or `undefined`.

## Returns

`string`[]
