[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildNullIdParseErrorResponse

# Function: buildNullIdParseErrorResponse()

> **buildNullIdParseErrorResponse**(`message?`): [`JsonRpcErrorResponse`](../interfaces/JsonRpcErrorResponse.md)

Defined in: [protocol/errors.ts:620](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/errors.ts#L620)

Builds the `id`-less / `null`-id parse-error response for unparseable input,
the one circumstance in which an error response's `id` need not match a
request id. (R-22.1-f, R-22.6-h, AC-34.4) The transport structurally requires
a value, so `id` is sent as `null`.

## Parameters

### message?

`string` = `'Parse error'`

## Returns

[`JsonRpcErrorResponse`](../interfaces/JsonRpcErrorResponse.md)
