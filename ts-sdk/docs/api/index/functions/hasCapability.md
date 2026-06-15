[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / hasCapability

# Function: hasCapability()

> **hasCapability**(`declaredCapabilities`, `required`): `boolean`

Defined in: [protocol/capabilities.ts:78](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/capabilities.ts#L78)

Returns `true` when a required capability has been declared; `false` otherwise.
Prefer `assertCapability` in enforcement code; use this predicate for
conditional logic. (R-2.2.2-b, AC-01.12, AC-01.13)

Like `assertCapability`, this function is stateless — capabilities must be
supplied from the current request. (R-2.2.2-a, AC-01.14)

## Parameters

### declaredCapabilities

`ReadonlySet`\<`string`\>

### required

`string`

## Returns

`boolean`
