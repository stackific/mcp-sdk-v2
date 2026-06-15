[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / mayServerDeclareUi

# Function: mayServerDeclareUi()

> **mayServerDeclareUi**(`hostExtensionsMap`): `boolean`

Defined in: [protocol/ui.ts:324](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui.ts#L324)

Returns `true` when a server MAY declare UI associations on its tools — only
when the host has advertised the extension with a `mimeTypes` array that
includes the verbatim [UI\_MIME\_TYPE](../variables/UI_MIME_TYPE.md). A server MUST NOT declare UI
associations otherwise. (§26.2, R-26.2-f)

## Parameters

### hostExtensionsMap

`unknown`

The host's advertised `extensions` map (raw), e.g.
  `clientCapabilities.extensions`.

## Returns

`boolean`
