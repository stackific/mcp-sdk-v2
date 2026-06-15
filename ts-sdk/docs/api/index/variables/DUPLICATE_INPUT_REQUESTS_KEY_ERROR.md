[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / DUPLICATE\_INPUT\_REQUESTS\_KEY\_ERROR

# Variable: DUPLICATE\_INPUT\_REQUESTS\_KEY\_ERROR

> `const` **DUPLICATE\_INPUT\_REQUESTS\_KEY\_ERROR**: `object`

Defined in: [protocol/multi-round-trip.ts:621](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/multi-round-trip.ts#L621)

The JSON-RPC error for an `InputRequiredResult` whose JSON repeats a member name. (R-11.2-f)

## Type Declaration

### code

> `readonly` **code**: `-32602` = `INVALID_PARAMS_CODE`

### message

> `readonly` **message**: `"Malformed InputRequiredResult: duplicate member name in object (R-11.2-f)"` = `'Malformed InputRequiredResult: duplicate member name in object (R-11.2-f)'`
