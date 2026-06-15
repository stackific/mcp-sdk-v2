[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / validateServerAccessToken

# Function: validateServerAccessToken()

> **validateServerAccessToken**(`options`): [`ServerTokenValidation`](../type-aliases/ServerTokenValidation.md)

Defined in: [protocol/security.ts:776](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L776)

Validates, server-side, that a presented access token is audience-bound to THIS
server and was validated before the request is processed; rejects otherwise so
no data is returned to an unauthorized party. (§28.5, R-28.5-b, R-28.5-c,
R-28.5-d, R-28.5-e; AC-44.12)

Delegates the audience check to S37's [validateTokenAudience](validateTokenAudience.md) (which §23
owns) and surfaces a `-32600` "token not valid for this resource" rejection
matching the story's wire example. A `false` from this MUST stop the request
before any data is returned (R-28.5-e).

## Parameters

### options

#### tokenAudience

`string` \| `string`[]

The `aud` claim the presented token carries. (R-28.5-b)

#### ownCanonicalResource

`string`

This server's canonical resource identifier.

#### validatedBeforeUse

`boolean`

`true` when the token was cryptographically
  validated before processing the request (R-28.5-d).

## Returns

[`ServerTokenValidation`](../type-aliases/ServerTokenValidation.md)
