[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / authorizationServerWellKnownUris

# Function: authorizationServerWellKnownUris()

> **authorizationServerWellKnownUris**(`issuer`): `string`[]

Defined in: [protocol/authorization.ts:858](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization.ts#L858)

Builds the ordered list of authorization-server metadata well-known URIs to
try for an `issuer`, in the exact specified priority order. (R-23.3-b, R-23.3-c)

For an issuer **with a path** (e.g. `https://auth.example.com/tenant1`):
  1. OAuth AS Metadata, path insertion — `…/.well-known/oauth-authorization-server/tenant1`;
  2. OIDC Discovery, path insertion — `…/.well-known/openid-configuration/tenant1`;
  3. OIDC Discovery, path appending — `…/tenant1/.well-known/openid-configuration`.

For an issuer **without a path** (e.g. `https://auth.example.com`):
  1. `…/.well-known/oauth-authorization-server`;
  2. `…/.well-known/openid-configuration`.

Both discovery mechanisms (OAuth AS Metadata and OIDC Discovery) are covered,
so a client building from this list supports both (R-23.3-b). The client uses
the first that returns a valid, issuer-matching document.

## Parameters

### issuer

`string`

The authorization server's issuer identifier URL.

## Returns

`string`[]

## Throws

When `issuer` is not an absolute URI.
