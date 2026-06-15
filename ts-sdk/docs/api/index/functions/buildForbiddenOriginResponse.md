[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildForbiddenOriginResponse

# Function: buildForbiddenOriginResponse()

> **buildForbiddenOriginResponse**(`message?`, `includeBody?`): [`HttpResponse`](../interfaces/HttpResponse.md)

Defined in: [transport/http/responses.ts:548](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/responses.ts#L548)

Builds the `403 Forbidden` response for a rejected `Origin`. The body MAY
carry a JSON-RPC error response *with no `id`*; pass `includeBody: false` to
omit it entirely. (R-9.7-a, R-9.11-b, R-9.11-c)

## Parameters

### message?

`string` = `'Origin not permitted'`

The error message when a body is included.

### includeBody?

`boolean` = `true`

Whether to include the id-less JSON-RPC error body
  (default `true`).

## Returns

[`HttpResponse`](../interfaces/HttpResponse.md)
