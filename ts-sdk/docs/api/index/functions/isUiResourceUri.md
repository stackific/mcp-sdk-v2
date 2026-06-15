[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isUiResourceUri

# Function: isUiResourceUri()

> **isUiResourceUri**(`uri`): `uri is string`

Defined in: [protocol/ui.ts:115](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui.ts#L115)

Returns `true` when `uri` is a `ui://`-scheme URI string. The authority and
path after `ui://` are server-defined and opaque; this only checks the scheme
— it deliberately parses no structure, because the host MUST treat the whole
URI as an opaque identifier and derive no network origin from it. (§26.4,
R-26.3-b, R-26.4-b, R-26.4-c)

## Parameters

### uri

`unknown`

## Returns

`uri is string`
