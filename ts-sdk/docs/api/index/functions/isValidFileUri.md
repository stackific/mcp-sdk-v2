[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isValidFileUri

# Function: isValidFileUri()

> **isValidFileUri**(`uri`): `uri is string`

Defined in: [protocol/roots.ts:275](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/roots.ts#L275)

Returns `true` when `uri` is a syntactically valid absolute URI per RFC 3986
AND uses the `file` scheme (begins with `file://`). (R-21.1.5-b, R-21.1.5-d ·
MUST; AC-32.11)

Uses the WHATWG `URL` parser (RFC 3986-compatible) to reject malformed URIs,
then asserts the `file:` scheme and the authority-introducing `//`. A
non-`file` scheme, a missing/empty value, or a malformed URI all return
`false`.

## Parameters

### uri

`unknown`

## Returns

`uri is string`
