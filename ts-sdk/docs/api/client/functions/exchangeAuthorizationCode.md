[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [client](../README.md) / exchangeAuthorizationCode

# Function: exchangeAuthorizationCode()

> **exchangeAuthorizationCode**(`metadata`, `options`): `Promise`\<[`OAuthTokenResponse`](../interfaces/OAuthTokenResponse.md)\>

Defined in: client/oauth.ts:195

Exchanges an authorization code (+ PKCE verifier) for tokens. (§23.5) The RFC 8707
`resource` parameter is REQUIRED so the issued token is audience-bound to this MCP
server (§23.6); a token minted without it is not safely scoped to one resource.

## Parameters

### metadata

`objectOutputType`

### options

#### clientId

`string`

#### clientSecret?

`string`

#### code

`string`

#### codeVerifier

`string`

#### redirectUri

`string`

#### resource

`string`

#### fetch?

(`input`, `init?`) => `Promise`\<`Response`\>

## Returns

`Promise`\<[`OAuthTokenResponse`](../interfaces/OAuthTokenResponse.md)\>
