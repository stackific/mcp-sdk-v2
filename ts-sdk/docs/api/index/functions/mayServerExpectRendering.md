[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / mayServerExpectRendering

# Function: mayServerExpectRendering()

> **mayServerExpectRendering**(`hostExtensionsMap`): `boolean`

Defined in: [protocol/ui.ts:338](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui.ts#L338)

Returns `true` when a server MAY expect a UI resource to be rendered — only
when the host has advertised the extension with the required [UI\_MIME\_TYPE](../variables/UI_MIME_TYPE.md).
A server MUST NOT expect rendering otherwise. (§26.2, R-26.2-g)

Same gate as [mayServerDeclareUi](mayServerDeclareUi.md); named separately so each prohibition
(declare vs expect-rendering) reads clearly at the call site.

## Parameters

### hostExtensionsMap

`unknown`

The host's advertised `extensions` map (raw).

## Returns

`boolean`
