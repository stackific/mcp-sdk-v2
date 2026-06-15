[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / MALFORMED\_INPUT\_REQUIRED\_RESULT\_ERROR

# Variable: MALFORMED\_INPUT\_REQUIRED\_RESULT\_ERROR

> `const` **MALFORMED\_INPUT\_REQUIRED\_RESULT\_ERROR**: `object`

Defined in: [protocol/multi-round-trip.ts:493](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/multi-round-trip.ts#L493)

The JSON-RPC error payload for an `InputRequiredResult` that is missing both
`inputRequests` and `requestState`. (R-11.2-c)

## Type Declaration

### code

> `readonly` **code**: `-32602` = `INVALID_PARAMS_CODE`

### message

> `readonly` **message**: `"Malformed InputRequiredResult: at least one of inputRequests or requestState must be present"` = `'Malformed InputRequiredResult: at least one of inputRequests or requestState must be present'`
