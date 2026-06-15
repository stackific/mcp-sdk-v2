[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildInvalidCursorError

# Function: buildInvalidCursorError()

> **buildInvalidCursorError**(`message?`): `object`

Defined in: [protocol/pagination.ts:122](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/pagination.ts#L122)

Builds the JSON-RPC error payload for an invalid-cursor rejection.
(R-12.4-c, R-12.4-d)

Servers SHOULD return this code when a client supplies a cursor that was
not issued by this server, is not recognized, or is otherwise malformed.

## Parameters

### message?

`string`

## Returns

`object`

### code

> **code**: `-32602`

### message

> **message**: `string`
