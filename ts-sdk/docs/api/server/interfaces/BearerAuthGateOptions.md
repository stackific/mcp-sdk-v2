[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [server](../README.md) / BearerAuthGateOptions

# Interface: BearerAuthGateOptions

Defined in: server/auth.ts:45

Options for [bearerAuthGate](../functions/bearerAuthGate.md).

## Properties

### validate

> **validate**: (`token`) => `unknown`

Defined in: server/auth.ts:52

Validates a bearer token, returning the caller's identity (threaded into
`ctx.authInfo`) or `null`/`undefined`/`false` to reject. When audience/scope
enforcement is enabled, return an object exposing the token's `aud`/`audience`
and `scope`(space-delimited string)/`scopes`(array) so they can be checked.

#### Parameters

##### token

`string`

#### Returns

`unknown`

***

### resourceMetadataUrl?

> `optional` **resourceMetadataUrl?**: `string`

Defined in: server/auth.ts:54

URL of the protected-resource metadata, advertised via `resource_metadata` in the challenge.

***

### expectedAudience?

> `optional` **expectedAudience?**: `string`

Defined in: server/auth.ts:60

This resource's canonical identifier. When set, the validated token's audience
MUST include it, or the request is rejected `401 invalid_token` — a server MUST
reject a token not issued for it and never forward it. (§23.6/§23.8/§23.19)

***

### requiredScopes?

> `optional` **requiredScopes?**: `string`[]

Defined in: server/auth.ts:66

Scopes this resource requires. When the token is missing any, the request is
rejected with a `403 insufficient_scope` step-up challenge. (§23.18)
Requires `resourceMetadataUrl` (the 403 challenge MUST carry `resource_metadata`).
