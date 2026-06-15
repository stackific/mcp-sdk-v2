[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isUriTemplate

# Function: isUriTemplate()

> **isUriTemplate**(`value`): `value is string`

Defined in: [protocol/resources.ts:212](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/resources.ts#L212)

Returns `true` when `value` conforms to the URI Template grammar of [RFC6570]:
literal characters interspersed with well-formed `{…}` variable expressions
(e.g. `file:///{path}`, `db://{table}/{id}`). (§17.4, R-17.4-m)

The check verifies brace balance and that every expression is non-empty and
contains a valid variable list — an optional leading operator from the RFC6570
set followed by one or more comma-separated `varspec`s, each a `varname` of
pct-encoded / unreserved / `.` / `_` characters with an OPTIONAL `*` (explode)
or `:N` (prefix, `N` a positive integer up to 9999) modifier. A literal `{` or
`}` that is not part of a balanced expression is rejected.

## Parameters

### value

`unknown`

## Returns

`value is string`
