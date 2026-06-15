[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / methodNotAllowedResponse

# Function: methodNotAllowedResponse()

> **methodNotAllowedResponse**(`httpMethod`): [`HttpResponse`](../interfaces/HttpResponse.md) \| `undefined`

Defined in: [transport/http/responses.ts:492](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/responses.ts#L492)

For a this-transport-only server, returns a `405 Method Not Allowed` response
(empty body) for an HTTP `GET` or `DELETE` at the MCP endpoint, or `undefined`
for `POST`. (R-9.9-f)

## Parameters

### httpMethod

`string`

The incoming HTTP method (any case).

## Returns

[`HttpResponse`](../interfaces/HttpResponse.md) \| `undefined`
