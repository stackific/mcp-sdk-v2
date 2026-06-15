[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildUiResourceContents

# Function: buildUiResourceContents()

> **buildUiResourceContents**(`config`): `objectOutputType`\<\{ `uri`: `ZodString`; `mimeType`: `ZodOptional`\<`ZodString`\>; `text`: `ZodString`; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\> \| `objectOutputType`\<\{ `uri`: `ZodString`; `mimeType`: `ZodOptional`\<`ZodString`\>; `blob`: `ZodEffects`\<`ZodString`, `string`, `string`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>

Defined in: [protocol/ui.ts:868](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui.ts#L868)

Builds a UI resource `contents` entry: the `ui://` `uri`, the verbatim
[UI\_MIME\_TYPE](../variables/UI_MIME_TYPE.md), the `text` OR `blob` payload, and — when supplied — the
[ResourceUiMeta](../type-aliases/ResourceUiMeta.md) hints nested under `_meta.ui`. (§26.4, R-26.4-d,
R-26.4-e)

`mimeType` is always set to the exact UI type so the result satisfies
R-26.4-d. Exactly one of `text`/`blob` MUST be supplied (the text/blob
exclusivity of S21).

## Parameters

### config

[`UiResourceContentsConfig`](../interfaces/UiResourceContentsConfig.md)

## Returns

`objectOutputType`\<\{ `uri`: `ZodString`; `mimeType`: `ZodOptional`\<`ZodString`\>; `text`: `ZodString`; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\> \| `objectOutputType`\<\{ `uri`: `ZodString`; `mimeType`: `ZodOptional`\<`ZodString`\>; `blob`: `ZodEffects`\<`ZodString`, `string`, `string`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>

## Throws

when `uri` is not a `ui://` URI, or when neither/both of
  `text` and `blob` are supplied.
