[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / parseImplementation

# Function: parseImplementation()

> **parseImplementation**(`value`): `objectOutputType`

Defined in: [types/implementation.ts:61](https://github.com/stackific/mcp-sdk-node/blob/main/src/types/implementation.ts#L61)

Parses and validates an `Implementation` descriptor.
Throws `ZodError` when `name` or `version` is absent or not a string.
Unknown properties are passed through without error. (§2.3.4)

## Parameters

### value

`unknown`

## Returns

`objectOutputType`
