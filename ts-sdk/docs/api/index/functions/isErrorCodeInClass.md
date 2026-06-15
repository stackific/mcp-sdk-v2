[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isErrorCodeInClass

# Function: isErrorCodeInClass()

> **isErrorCodeInClass**(`code`, `cls`): `boolean`

Defined in: [protocol/errors.ts:308](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/errors.ts#L308)

Validates that `code` is allowed for the given classification — used to check
a value sits in its intended range. For `SERVER_DEFINED`, the code MUST lie in
`-32000..-32099`; for `EXTENSION_DEFINED`, it MUST be a non-reserved integer
outside the reserved range; for the standard/protocol classes, it MUST be the
corresponding registered code. (§22.2, §22.7)

## Parameters

### code

`number`

### cls

[`ErrorCodeClass`](../type-aliases/ErrorCodeClass.md)

## Returns

`boolean`
