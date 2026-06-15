[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isAbsoluteUri

# Function: isAbsoluteUri()

> **isAbsoluteUri**(`value`): `value is string`

Defined in: [protocol/streaming.ts:136](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/streaming.ts#L136)

Returns `true` when `value` is an absolute URI string [RFC3986] — it has a
scheme followed by `:` and at least one further character (e.g.
`file:///x`, `https://h/p`). A relative reference (no scheme) is rejected.
(§10.2, R-10.2-i)

Uses the WHATWG `URL` parser, which only accepts absolute URLs, then confirms a
conformant scheme so that values like `mailto:` with an empty path are handled
consistently with the RFC3986 `scheme ":" hier-part` requirement.

## Parameters

### value

`unknown`

## Returns

`value is string`
