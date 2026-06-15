[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / parseWwwAuthenticate

# Function: parseWwwAuthenticate()

> **parseWwwAuthenticate**(`headerValue`): [`WwwAuthenticateChallenge`](../interfaces/WwwAuthenticateChallenge.md) \| `undefined`

Defined in: [protocol/authorization.ts:504](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization.ts#L504)

Parses a `WWW-Authenticate` header value carrying a `Bearer` challenge into
its structured fields. (R-23.1-z)

A client MUST be able to parse `WWW-Authenticate` headers and react to a `401`
(R-23.1-z); this is that parser. It accepts the auth-param forms RFC 7235
permits — quoted (`key="value"`) and bare (`key=value`) — comma-separated,
with arbitrary surrounding whitespace, and unescapes `\"`/`\\` inside quoted
values. The scheme match is case-insensitive. Returns `undefined` when the
value does not use the `Bearer` scheme.

## Parameters

### headerValue

`string`

The raw `WWW-Authenticate` header value.

## Returns

[`WwwAuthenticateChallenge`](../interfaces/WwwAuthenticateChallenge.md) \| `undefined`
