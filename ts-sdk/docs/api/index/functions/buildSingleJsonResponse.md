[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildSingleJsonResponse

# Function: buildSingleJsonResponse()

> **buildSingleJsonResponse**(`response`): [`HttpResponse`](../interfaces/HttpResponse.md)

Defined in: [transport/http/responses.ts:143](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/responses.ts#L143)

Builds the single-JSON response: HTTP `200 OK`, `Content-Type: application/json`,
and a body of exactly one JSON-RPC response whose `id` equals the request `id`.
(R-9.6.1-a)

## Parameters

### response

`object` & `Record`\<`string`, `unknown`\>

One JSON-RPC response object (a result or error response);
  its `id` MUST already equal the originating request's `id`.

## Returns

[`HttpResponse`](../interfaces/HttpResponse.md)
