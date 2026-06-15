[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isValidErrorResponse

# Function: isValidErrorResponse()

> **isValidErrorResponse**(`value`): `value is JsonRpcErrorResponse`

Defined in: [protocol/errors.ts:406](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/errors.ts#L406)

Validates an error response envelope per §22.1/§22.6: `jsonrpc` is exactly
`"2.0"`, it carries a valid `error` object and no `result`, and `id` — when
present — is a string, an integer, or `null`. (R-22.1-a, R-22.1-d, R-22.6-g,
R-22.6-h, AC-34.1, AC-34.2, AC-34.3, AC-34.4)

This validates structure only; whether the `id` *matches* a specific request
is the caller's correlation concern (S03).

## Parameters

### value

`unknown`

## Returns

`value is JsonRpcErrorResponse`
