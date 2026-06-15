[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / describeUnknownErrorCode

# Function: describeUnknownErrorCode()

> **describeUnknownErrorCode**(`error`): `object`

Defined in: [protocol/errors.ts:487](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/errors.ts#L487)

Surfaces an error response carrying a code the receiver does not recognize.
Per R-22.7-e a receiver MUST treat an unknown code as a failed request and
surface it using `error.message` and `error.data`, NOT reject it as
malformed. Returns a plain descriptor a caller can log or propagate. (AC-34.24)

## Parameters

### error

[`JsonRpcErrorObject`](../interfaces/JsonRpcErrorObject.md)

The (well-formed) error object with an unrecognized `code`.

## Returns

`object`

### failed

> **failed**: `true`

### code

> **code**: `number`

### class

> **class**: [`ErrorCodeClass`](../type-aliases/ErrorCodeClass.md)

### message

> **message**: `string`

### data?

> `optional` **data?**: `unknown`
