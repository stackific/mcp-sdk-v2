[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [client](../README.md) / registerClient

# Function: registerClient()

> **registerClient**(`metadata`, `options`): `Promise`\<\{ `clientId`: `string`; `clientSecret?`: `string`; \}\>

Defined in: client/oauth.ts:118

Dynamic client registration (RFC 7591). (§23.4)

## Parameters

### metadata

`objectOutputType`

### options

#### clientName

`string`

#### redirectUris?

`string`[]

#### grantTypes?

`string`[]

#### applicationType?

`"native"` \| `"web"`

OAuth `application_type` — REQUIRED by §23.15; defaults to `'web'`.

#### fetch?

(`input`, `init?`) => `Promise`\<`Response`\>

## Returns

`Promise`\<\{ `clientId`: `string`; `clientSecret?`: `string`; \}\>
