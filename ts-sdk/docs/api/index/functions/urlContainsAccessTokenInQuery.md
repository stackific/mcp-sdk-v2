[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / urlContainsAccessTokenInQuery

# Function: urlContainsAccessTokenInQuery()

> **urlContainsAccessTokenInQuery**(`requestUrl`): `boolean`

Defined in: [protocol/authorization-flow.ts:1543](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L1543)

Returns `true` when a URL carries an `access_token` in its query string, which a
client MUST NOT do. (R-23.8-c)

Use to assert that a request URL does not smuggle the token in the query string;
the token belongs only in the `Authorization` header (R-23.8-b).

## Parameters

### requestUrl

`string`

The request URL to inspect.

## Returns

`boolean`
