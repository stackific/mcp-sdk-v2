[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildHeaderMismatchResponse

# Function: buildHeaderMismatchResponse()

> **buildHeaderMismatchResponse**(`error`, `id?`): [`HttpResponse`](../interfaces/HttpResponse.md)

Defined in: [transport/http/responses.ts:345](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/responses.ts#L345)

Wraps an error object into a `400 Bad Request` HTTP response carrying a
`JSONRPCErrorResponse` body. (R-9.8-a, §9.7)

## Parameters

### error

`objectOutputType`

The JSON-RPC error object (e.g. from [buildHeaderMismatchError](buildHeaderMismatchError.md)).

### id?

`string` \| `number`

The originating request id, when known; omitted otherwise.

## Returns

[`HttpResponse`](../interfaces/HttpResponse.md)
