[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / validateResourceUriAccess

# Function: validateResourceUriAccess()

> **validateResourceUriAccess**(`uri`, `options`): [`ResourceUriValidation`](../type-aliases/ResourceUriValidation.md)

Defined in: [protocol/security.ts:1363](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L1363)

Validates a resource URI before dereferencing or matching it: it parses as an
absolute URI, its location is one the user has authorized, and (when it could
trigger a network request) it is not an SSRF target. (§28.10, R-28.10-f,
R-28.10-g, R-28.10-h; AC-44.25)

Returns the first violation. Authorization is delegated to a caller-supplied
predicate over the parsed URL (the host owns the authorized-location policy); the
SSRF guard rejects a URL whose host resolves to a private/loopback/link-local
address when `guardSsrf` is set, since the receiver MUST NOT be driven to fetch
an internal location.

## Parameters

### uri

`string`

The resource URI to validate. (R-28.10-f)

### options

#### isAuthorizedLocation

(`url`) => `boolean`

Predicate: is this URL a location the user authorized? (R-28.10-g)

#### guardSsrf?

`boolean`

When `true`, reject private/loopback/link-local hosts. (R-28.10-h)

## Returns

[`ResourceUriValidation`](../type-aliases/ResourceUriValidation.md)
