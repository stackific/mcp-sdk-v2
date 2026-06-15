[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / UiResourceContentsConfig

# Interface: UiResourceContentsConfig

Defined in: [protocol/ui.ts:844](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui.ts#L844)

The server-supplied inputs to a UI resource `contents` entry.

## Properties

### uri

> **uri**: `string`

Defined in: [protocol/ui.ts:846](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui.ts#L846)

REQUIRED `ui://` URI of the resource. (R-26.3-b, R-26.4-b)

***

### text?

> `optional` **text?**: `string`

Defined in: [protocol/ui.ts:848](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui.ts#L848)

The HTML document as text. Provide EITHER `text` or `blob`, not both.

***

### blob?

> `optional` **blob?**: `string`

Defined in: [protocol/ui.ts:850](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui.ts#L850)

The document as Base64 (binary-encoded payload). Provide EITHER `text` or `blob`.

***

### ui?

> `optional` **ui?**: `objectOutputType`\<\{ `csp`: `ZodOptional`\<`ZodObject`\<\{ `connectDomains`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `resourceDomains`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `frameDomains`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `baseUriDomains`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `connectDomains`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `resourceDomains`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `frameDomains`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `baseUriDomains`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `connectDomains`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `resourceDomains`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `frameDomains`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `baseUriDomains`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>\>; `permissions`: `ZodOptional`\<`ZodObject`\<\{ `camera`: `ZodOptional`\<`ZodObject`\<\{ \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ \}, `ZodTypeAny`, `"passthrough"`\>\>\>; `microphone`: `ZodOptional`\<`ZodObject`\<\{ \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ \}, `ZodTypeAny`, `"passthrough"`\>\>\>; `geolocation`: `ZodOptional`\<`ZodObject`\<\{ \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ \}, `ZodTypeAny`, `"passthrough"`\>\>\>; `clipboardWrite`: `ZodOptional`\<`ZodObject`\<\{ \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ \}, `ZodTypeAny`, `"passthrough"`\>\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `camera`: `ZodOptional`\<`ZodObject`\<\{ \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ \}, `ZodTypeAny`, `"passthrough"`\>\>\>; `microphone`: `ZodOptional`\<`ZodObject`\<\{ \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ \}, `ZodTypeAny`, `"passthrough"`\>\>\>; `geolocation`: `ZodOptional`\<`ZodObject`\<\{ \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ \}, `ZodTypeAny`, `"passthrough"`\>\>\>; `clipboardWrite`: `ZodOptional`\<`ZodObject`\<\{ \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ \}, `ZodTypeAny`, `"passthrough"`\>\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `camera`: `ZodOptional`\<`ZodObject`\<\{ \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ \}, `ZodTypeAny`, `"passthrough"`\>\>\>; `microphone`: `ZodOptional`\<`ZodObject`\<\{ \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ \}, `ZodTypeAny`, `"passthrough"`\>\>\>; `geolocation`: `ZodOptional`\<`ZodObject`\<\{ \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ \}, `ZodTypeAny`, `"passthrough"`\>\>\>; `clipboardWrite`: `ZodOptional`\<`ZodObject`\<\{ \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ \}, `ZodTypeAny`, `"passthrough"`\>\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>\>; `domain`: `ZodOptional`\<`ZodString`\>; `prefersBorder`: `ZodOptional`\<`ZodBoolean`\>; \}, `ZodTypeAny`, `"passthrough"`\>

Defined in: [protocol/ui.ts:852](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui.ts#L852)

OPTIONAL presentation/security hints carried under `_meta.ui`. (R-26.4-e)
