[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / UiHostExtensionCapabilitySchema

# Variable: UiHostExtensionCapabilitySchema

> `const` **UiHostExtensionCapabilitySchema**: `ZodObject`\<\{ `mimeTypes`: `ZodArray`\<`ZodString`, `"many"`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `mimeTypes`: `ZodArray`\<`ZodString`, `"many"`\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `mimeTypes`: `ZodArray`\<`ZodString`, `"many"`\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/ui.ts:205](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui.ts#L205)

`UiHostExtensionCapability` — the value a host advertises under
[UI\_EXTENSION\_ID](UI_EXTENSION_ID.md) in the `extensions` map of the
`io.modelcontextprotocol/clientCapabilities` it carries in request `_meta`.
(§26.2, R-26.2-c, R-26.2-d, R-26.2-e)

`mimeTypes` is REQUIRED: the UI resource MIME types the host can render. A
host that supports this extension MUST include the exact [UI\_MIME\_TYPE](UI_MIME_TYPE.md)
string. The shape is validated structurally here (a string array); the
verbatim-MIME requirement is checked by [hostAdvertisesUiRendering](../functions/hostAdvertisesUiRendering.md) /
[capabilityRendersUi](../functions/capabilityRendersUi.md), not by the schema, so a malformed-but-parseable
advertisement is still recognized as "advertised the extension, but not
conformingly". `.passthrough()` preserves forward-compatible members.
