[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isValidErrorObject

# Function: isValidErrorObject()

> **isValidErrorObject**(`value`): `value is JsonRpcErrorObject`

Defined in: [protocol/errors.ts:375](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/errors.ts#L375)

Validates the canonical error-object shape: `code` present and an integer
(possibly negative), `message` present and a string, `data` optional.
(R-22.1-c, R-22.1-h, R-22.1-i, R-22.1-k, AC-34.6)

## Parameters

### value

`unknown`

## Returns

`value is JsonRpcErrorObject`
