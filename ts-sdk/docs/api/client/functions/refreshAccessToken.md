[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [client](../README.md) / refreshAccessToken

# Function: refreshAccessToken()

> **refreshAccessToken**(`metadata`, `options`): `Promise`\<[`OAuthTokenResponse`](../interfaces/OAuthTokenResponse.md)\>

Defined in: client/oauth.ts:219

Redeems a refresh token for a fresh access token. (§23.9) The `resource`
parameter is REQUIRED on refresh too, so the new token keeps the same
audience binding as the original (§23.9).

## Parameters

### metadata

`objectOutputType`

### options

#### clientId

`string`

#### clientSecret?

`string`

#### refreshToken

`string`

#### resource

`string`

#### fetch?

(`input`, `init?`) => `Promise`\<`Response`\>

## Returns

`Promise`\<[`OAuthTokenResponse`](../interfaces/OAuthTokenResponse.md)\>
