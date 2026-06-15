[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isResourceUri

# Function: isResourceUri()

> **isResourceUri**(`value`): `value is string`

Defined in: [protocol/resources.ts:176](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/resources.ts#L176)

Returns `true` when `value` is a string in URI format [RFC3986] usable as a
concrete `Resource.uri` — it carries a scheme and at least one further
character. The scheme MAY be anything; the server defines its meaning.
(§17.4, R-17.4-a, R-17.4-b)

A concrete resource URI must identify the resource uniquely, so a relative
reference (no scheme) is rejected. Uses the WHATWG `URL` parser (which only
accepts absolute URIs) after a conformant-scheme check so values like
`urn:isbn:0451450523` with an empty authority are handled consistently.

## Parameters

### value

`unknown`

## Returns

`value is string`
