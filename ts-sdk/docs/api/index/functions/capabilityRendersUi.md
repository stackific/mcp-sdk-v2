[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / capabilityRendersUi

# Function: capabilityRendersUi()

> **capabilityRendersUi**(`value`): `boolean`

Defined in: [protocol/ui.ts:235](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui.ts#L235)

Returns `true` when an advertised host capability value enables UI rendering:
it is a well-formed [UiHostExtensionCapability](../type-aliases/UiHostExtensionCapability.md) AND its `mimeTypes`
array contains the verbatim [UI\_MIME\_TYPE](../variables/UI_MIME_TYPE.md). (R-26.2-d, R-26.2-e)

A capability whose `mimeTypes` carries only `"text/html; profile=mcp-app"`
(extra whitespace) or `"TEXT/HTML;PROFILE=MCP-APP"` (wrong case) returns
`false`: the string is matched byte-exact and case-sensitively.

## Parameters

### value

`unknown`

## Returns

`boolean`
