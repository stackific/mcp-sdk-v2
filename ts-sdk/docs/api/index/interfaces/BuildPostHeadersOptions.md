[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / BuildPostHeadersOptions

# Interface: BuildPostHeadersOptions

Defined in: [transport/http/headers.ts:129](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/headers.ts#L129)

Inputs to [buildPostHeaders](../functions/buildPostHeaders.md).

## Properties

### protocolVersion

> **protocolVersion**: `string`

Defined in: [transport/http/headers.ts:131](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/headers.ts#L131)

The protocol revision; also present in the body `_meta`. (R-9.3.3-a)

***

### method

> **method**: `string`

Defined in: [transport/http/headers.ts:133](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/headers.ts#L133)

The JSON-RPC `method`; mirrored into `Mcp-Method`. (R-9.4.1-a)

***

### params?

> `optional` **params?**: `Record`\<`string`, `unknown`\>

Defined in: [transport/http/headers.ts:135](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/headers.ts#L135)

The body `params`, used to derive `Mcp-Name` for targeted methods.

***

### paramHeaders?

> `optional` **paramHeaders?**: `Record`\<`string`, `string`\>

Defined in: [transport/http/headers.ts:137](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/headers.ts#L137)

Pre-built `Mcp-Param-*` headers (see param-headers.ts).
