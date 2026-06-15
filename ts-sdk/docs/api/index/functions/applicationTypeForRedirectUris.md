[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / applicationTypeForRedirectUris

# Function: applicationTypeForRedirectUris()

> **applicationTypeForRedirectUris**(`redirectUris`): [`ApplicationType`](../type-aliases/ApplicationType.md)

Defined in: [protocol/authorization-registration.ts:386](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L386)

Classifies a set of redirect URIs as native or web and returns the
`application_type` a client SHOULD register, consistent with those URIs.
(R-23.15-a, R-23.15-b, R-23.15-c)

Redirect URIs that all resolve to a loopback/localhost host indicate a native
application (desktop/mobile/CLI/locally hosted web app) → `"native"`; otherwise
a remote browser-based application → `"web"`. The classification follows S36's
`applicationTypeFor` with the loopback test that makes it consistent with the
redirect URIs (R-23.15-a).

## Parameters

### redirectUris

readonly `string`[]

The client's redirect URIs.

## Returns

[`ApplicationType`](../type-aliases/ApplicationType.md)
