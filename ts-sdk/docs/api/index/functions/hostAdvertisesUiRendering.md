[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / hostAdvertisesUiRendering

# Function: hostAdvertisesUiRendering()

> **hostAdvertisesUiRendering**(`extensionsMap`): `boolean`

Defined in: [protocol/ui.ts:287](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui.ts#L287)

Returns `true` when a host's `extensions` map advertises the apps extension in
a way that enables UI rendering: the [UI\_EXTENSION\_ID](../variables/UI_EXTENSION_ID.md) key is present
with a [UiHostExtensionCapability](../type-aliases/UiHostExtensionCapability.md) whose `mimeTypes` includes the
verbatim [UI\_MIME\_TYPE](../variables/UI_MIME_TYPE.md). (§26.2, R-26.2-c, R-26.2-d, R-26.2-e)

This is the predicate behind the server's two prohibitions: a server MUST NOT
declare UI associations (R-26.2-f) and MUST NOT expect any UI resource to be
rendered (R-26.2-g) unless this returns `true` for the host's advertisement.
See [mayServerDeclareUi](mayServerDeclareUi.md) / [mayServerExpectRendering](mayServerExpectRendering.md).

## Parameters

### extensionsMap

`unknown`

A host's advertised `extensions` map (raw), e.g.
  `clientCapabilities.extensions`.

## Returns

`boolean`
