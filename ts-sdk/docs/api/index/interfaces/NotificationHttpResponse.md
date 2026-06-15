[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / NotificationHttpResponse

# Interface: NotificationHttpResponse

Defined in: [transport/http/headers.ts:360](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/headers.ts#L360)

The HTTP response a server returns to a posted notification. (§9.2)

## Properties

### status

> **status**: `number`

Defined in: [transport/http/headers.ts:361](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/headers.ts#L361)

***

### body?

> `optional` **body?**: `object`

Defined in: [transport/http/headers.ts:363](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/headers.ts#L363)

Present only on rejection; an id-less JSON-RPC error. (R-9.2-i)

#### jsonrpc

> **jsonrpc**: `"2.0"`

#### error

> **error**: `object`

##### error.code

> **code**: `number`

##### error.message

> **message**: `string`

##### error.data?

> `optional` **data?**: `unknown`
