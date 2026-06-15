[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / authorizationServerMetadataUris

# Function: authorizationServerMetadataUris()

> **authorizationServerMetadataUris**(`issuer`): `string`[]

Defined in: [protocol/authorization-registration.ts:695](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L695)

Returns the ordered authorization-server-metadata well-known URIs to try for
`issuer`, covering both OAuth 2.0 AS Metadata and OpenID Connect Discovery, for
issuers with and without a path component. (R-23.17-e, R-23.17-f, R-23.17-g)

A thin pass-through over S35's [authorizationServerWellKnownUris](authorizationServerWellKnownUris.md), surfaced
under the §23.17 atoms; returns the three path-component URIs (OAuth insertion,
OIDC insertion, OIDC appending) for a path issuer and the two for a non-path
issuer, in the mandated priority order.

## Parameters

### issuer

`string`

The authorization server's `issuer` identifier URL.

## Returns

`string`[]
