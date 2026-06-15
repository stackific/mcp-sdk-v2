[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildErrorResponse

# Function: buildErrorResponse()

> **buildErrorResponse**(`status`, `error`, `id?`): [`HttpResponse`](../interfaces/HttpResponse.md)

Defined in: [transport/http/responses.ts:386](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/responses.ts#L386)

Wraps any JSON-RPC error object into an HTTP response carrying a
`JSONRPCErrorResponse` body. (§9.7) Used for `400`/`404`/`403` bodies.

## Parameters

### status

`number`

The HTTP status (e.g. `400`, `404`, `403`).

### error

`objectOutputType`

The JSON-RPC error object.

### id?

`string` \| `number`

The originating request id; omitted when it cannot be determined.

## Returns

[`HttpResponse`](../interfaces/HttpResponse.md)
