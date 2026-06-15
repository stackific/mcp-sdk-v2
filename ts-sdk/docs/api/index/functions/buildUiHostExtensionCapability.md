[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildUiHostExtensionCapability

# Function: buildUiHostExtensionCapability()

> **buildUiHostExtensionCapability**(`additionalMimeTypes?`): `objectOutputType`

Defined in: [protocol/ui.ts:249](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui.ts#L249)

Builds a conformant [UiHostExtensionCapability](../type-aliases/UiHostExtensionCapability.md) for a host that supports
UI rendering. [UI\_MIME\_TYPE](../variables/UI_MIME_TYPE.md) is always included (deduplicated) so the
result satisfies R-26.2-e; additional renderable MIME types MAY be supplied
and are appended in order. (§26.2, R-26.2-d, R-26.2-e)

## Parameters

### additionalMimeTypes?

readonly `string`[] = `[]`

Extra MIME types the host can render, beyond the
  mandatory UI type.

## Returns

`objectOutputType`
