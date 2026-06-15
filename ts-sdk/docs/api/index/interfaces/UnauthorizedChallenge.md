[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / UnauthorizedChallenge

# Interface: UnauthorizedChallenge

Defined in: [protocol/authorization.ts:367](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization.ts#L367)

A built `401` Unauthorized challenge response (status + header value).

## Properties

### status

> **status**: `401`

Defined in: [protocol/authorization.ts:369](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization.ts#L369)

HTTP status `401`. (R-23.1-t)

***

### headers

> **headers**: `object`

Defined in: [protocol/authorization.ts:371](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization.ts#L371)

The `WWW-Authenticate` header name + value pair. (R-23.1-u)

#### WWW-Authenticate

> **WWW-Authenticate**: `string`
