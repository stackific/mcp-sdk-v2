[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [client](../README.md) / buildAuthorizeUrl

# Function: buildAuthorizeUrl()

> **buildAuthorizeUrl**(`metadata`, `options`): `string`

Defined in: client/oauth.ts:146

Builds the authorization-request URL (response_type=code + PKCE). (§23.5)

## Parameters

### metadata

`objectOutputType`

### options

#### clientId

`string`

#### redirectUri

`string`

#### resource

`string`

#### scope?

`string`

#### state

`string`

#### codeChallenge

`string`

## Returns

`string`
