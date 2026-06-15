[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / InsufficientScopeChallenge

# Interface: InsufficientScopeChallenge

Defined in: [protocol/authorization.ts:375](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization.ts#L375)

A built `403` insufficient-scope challenge response (status + header value).

## Properties

### status

> **status**: `403`

Defined in: [protocol/authorization.ts:377](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization.ts#L377)

HTTP status `403`. (R-23.1-aa)

***

### headers

> **headers**: `object`

Defined in: [protocol/authorization.ts:379](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization.ts#L379)

The `WWW-Authenticate` header name + value pair. (R-23.1-aa)

#### WWW-Authenticate

> **WWW-Authenticate**: `string`
