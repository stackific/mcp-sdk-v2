[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [client](../README.md) / createAuthProvider

# Function: createAuthProvider()

> **createAuthProvider**(`initial`, `refresh?`, `options?`): [`AuthProvider`](../interfaces/AuthProvider.md)

Defined in: client/oauth.ts:241

Wraps a token response as an [AuthProvider](../interfaces/AuthProvider.md), transparently refreshing
shortly before expiry when a `refresh` callback is supplied. The returned
provider is what [StreamableHTTPClientTransport](../classes/StreamableHTTPClientTransport.md) calls per request.

## Parameters

### initial

[`OAuthTokenResponse`](../interfaces/OAuthTokenResponse.md)

### refresh?

(`refreshToken`) => `Promise`\<[`OAuthTokenResponse`](../interfaces/OAuthTokenResponse.md)\>

### options?

#### now?

() => `number`

#### skewMs?

`number`

## Returns

[`AuthProvider`](../interfaces/AuthProvider.md)
