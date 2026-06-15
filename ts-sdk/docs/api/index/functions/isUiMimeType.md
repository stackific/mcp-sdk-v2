[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isUiMimeType

# Function: isUiMimeType()

> **isUiMimeType**(`mimeType`): `mimeType is "text/html;profile=mcp-app"`

Defined in: [protocol/ui.ts:97](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui.ts#L97)

Returns `true` when `mimeType` is exactly the UI MIME type [UI\_MIME\_TYPE](../variables/UI_MIME_TYPE.md)
— matched verbatim and case-sensitively, with no whitespace tolerance.
(R-26.2-e, R-26.4-d)

This is the single gate behind "the host advertised the required type" and
"the resource was served with the required type": both demand the byte-exact
string, so trimming or lower-casing would be non-conformant.

## Parameters

### mimeType

`unknown`

## Returns

`mimeType is "text/html;profile=mcp-app"`
