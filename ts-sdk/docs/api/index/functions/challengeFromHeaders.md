[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / challengeFromHeaders

# Function: challengeFromHeaders()

> **challengeFromHeaders**(`headers`): [`WwwAuthenticateChallenge`](../interfaces/WwwAuthenticateChallenge.md) \| `undefined`

Defined in: [protocol/authorization.ts:537](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization.ts#L537)

Extracts the parsed `Bearer` challenge from a bag of HTTP response headers, or
`undefined` when there is no parseable `WWW-Authenticate` `Bearer` challenge.
Header lookup is case-insensitive (reuses `getHeader`). (R-23.1-z)

## Parameters

### headers

[`HttpHeaders`](../type-aliases/HttpHeaders.md)

The HTTP response headers.

## Returns

[`WwwAuthenticateChallenge`](../interfaces/WwwAuthenticateChallenge.md) \| `undefined`
