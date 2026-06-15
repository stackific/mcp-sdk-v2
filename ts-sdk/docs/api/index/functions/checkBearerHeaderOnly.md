[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / checkBearerHeaderOnly

# Function: checkBearerHeaderOnly()

> **checkBearerHeaderOnly**(`options`): [`BearerHeaderValidation`](../type-aliases/BearerHeaderValidation.md)

Defined in: [protocol/authorization-registration.ts:1162](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L1162)

Validates that the access token is presented ONLY in the `Authorization: Bearer`
request header and NEVER in the URI query string. (R-23.19-p)

Reuses S36's [urlContainsAccessTokenInQuery](urlContainsAccessTokenInQuery.md) to reject a request URL that
smuggles `access_token` in the query, and requires an `Authorization` header to
be present (the token's only permitted location).

## Parameters

### options

#### requestUrl

`string`

The request URL to inspect for a query-string token.

#### hasAuthorizationHeader

`boolean`

Whether the request carries an
  `Authorization` header.

## Returns

[`BearerHeaderValidation`](../type-aliases/BearerHeaderValidation.md)
