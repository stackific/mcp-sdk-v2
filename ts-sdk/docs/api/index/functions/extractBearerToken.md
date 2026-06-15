[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / extractBearerToken

# Function: extractBearerToken()

> **extractBearerToken**(`headerValue`): `string` \| `undefined`

Defined in: [protocol/authorization-flow.ts:1525](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L1525)

Extracts the bearer token from an `Authorization` header value, or `undefined`
when the header is absent or does not use the `Bearer` scheme. (R-23.8-b)

The scheme match is case-insensitive per RFC 7235.

## Parameters

### headerValue

`string` \| `undefined`

The raw `Authorization` header value, if any.

## Returns

`string` \| `undefined`
