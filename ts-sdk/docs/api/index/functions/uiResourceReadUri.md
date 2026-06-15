[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / uiResourceReadUri

# Function: uiResourceReadUri()

> **uiResourceReadUri**(`meta`): `string` \| `undefined`

Defined in: [protocol/ui.ts:940](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui.ts#L940)

Returns the `ui://` URI to use in a `resources/read` request for a tool's UI
resource: the EXACT `resourceUri` from the tool's `_meta.ui`, treated as an
opaque identifier. The host issues `resources/read` for this exact string and
MUST NOT derive a network origin from it. (§26.4, R-26.3-c, R-26.4-b,
R-26.4-c)

Returns `undefined` when the tool carries no (well-formed) UI declaration.
This performs no parsing of the URI beyond the scheme check already done at
declaration time — honoring "treat the whole URI as an opaque identifier".

## Parameters

### meta

`Pick`\<`objectOutputType`\<\{ `resourceUri`: `ZodEffects`\<`ZodString`, `string`, `string`\>; `visibility`: `ZodOptional`\<`ZodArray`\<`ZodEnum`\<\[`"model"`, `"app"`\]\>, `"many"`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `"resourceUri"`\> \| `undefined`

The tool's [ToolUiMeta](../type-aliases/ToolUiMeta.md).

## Returns

`string` \| `undefined`
