[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / requireAuthorizationServers

# Function: requireAuthorizationServers()

> **requireAuthorizationServers**(`metadata`): [`AuthorizationServersValidation`](../type-aliases/AuthorizationServersValidation.md)

Defined in: [protocol/authorization-registration.ts:670](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L670)

Validates that protected-resource metadata carries the REQUIRED
`authorization_servers` array of one or more issuer identifiers. (R-23.17-c)

A valid document MUST contain `authorization_servers` with at least one entry;
when more than one is listed, each is an independent authorization server the
client selects among, maintaining separate registration state per AS (R-23.17-d,
enforced by [IssuerBoundCredentialStore](../classes/IssuerBoundCredentialStore.md)).

## Parameters

### metadata

`Pick`\<[`ProtectedResourceMetadata`](../type-aliases/ProtectedResourceMetadata.md), `"authorization_servers"`\>

The protected-resource metadata.

## Returns

[`AuthorizationServersValidation`](../type-aliases/AuthorizationServersValidation.md)
