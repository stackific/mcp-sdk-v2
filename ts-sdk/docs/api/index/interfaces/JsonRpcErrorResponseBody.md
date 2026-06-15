[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / JsonRpcErrorResponseBody

# Interface: JsonRpcErrorResponseBody

Defined in: [transport/http/responses.ts:312](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/responses.ts#L312)

The canonical `JSONRPCErrorResponse` body delivered with an HTTP `400`
(and optionally a `403`) at the transport boundary. (§9.7)

`id` is omitted when no request id can be determined — an unparseable body or
an `Origin`-rejected request. (§9.7, R-9.11-c)

## Properties

### jsonrpc

> **jsonrpc**: `"2.0"`

Defined in: [transport/http/responses.ts:313](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/responses.ts#L313)

***

### id?

> `optional` **id?**: `string` \| `number`

Defined in: [transport/http/responses.ts:315](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/responses.ts#L315)

The originating request id; omitted when it cannot be determined.

***

### error

> **error**: `objectOutputType`

Defined in: [transport/http/responses.ts:317](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/responses.ts#L317)

The canonical error object (§3.8): `code`, `message`, optional `data`.
