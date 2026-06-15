[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / validateLogLevelOptIn

# Function: validateLogLevelOptIn()

> **validateLogLevelOptIn**(`logLevel`): [`LogLevelValidationResult`](../type-aliases/LogLevelValidationResult.md)

Defined in: [protocol/logging.ts:115](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/logging.ts#L115)

Validates the `io.modelcontextprotocol/logLevel` opt-in value from a request's
`_meta`. Returns `{ ok: true }` when the value is a recognized `LoggingLevel`
string, and an `-32602` error when it is not. (R-15.3.3-g)

A server SHOULD reject a request whose `logLevel` value is not one of the
recognized strings with JSON-RPC error code `-32602` (Invalid params).

## Parameters

### logLevel

`unknown`

The raw value of `io.modelcontextprotocol/logLevel` from `_meta`.

## Returns

[`LogLevelValidationResult`](../type-aliases/LogLevelValidationResult.md)
