[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildMethodNotFoundResponse

# Function: buildMethodNotFoundResponse()

> **buildMethodNotFoundResponse**(`method`, `id?`): [`HttpResponse`](../interfaces/HttpResponse.md)

Defined in: [transport/http/responses.ts:400](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/responses.ts#L400)

Builds the `404 Not Found` for an unimplemented method: it ALWAYS carries a
JSON-RPC error body with code `-32601`, which distinguishes an MCP endpoint
from a host `404` that does not serve the endpoint at all. (R-9.7-b)

## Parameters

### method

`string`

The method name that was not found (for the message).

### id?

`string` \| `number`

The originating request id, when known.

## Returns

[`HttpResponse`](../interfaces/HttpResponse.md)
