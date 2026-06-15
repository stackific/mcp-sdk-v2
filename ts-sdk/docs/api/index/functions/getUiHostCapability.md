[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / getUiHostCapability

# Function: getUiHostCapability()

> **getUiHostCapability**(`extensionsMap`): `objectOutputType`\<\{ `mimeTypes`: `ZodArray`\<`ZodString`, `"many"`\>; \}, `ZodTypeAny`, `"passthrough"`\> \| `undefined`

Defined in: [protocol/ui.ts:267](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui.ts#L267)

Reads the [UiHostExtensionCapability](../type-aliases/UiHostExtensionCapability.md) a host advertised under
[UI\_EXTENSION\_ID](../variables/UI_EXTENSION_ID.md) from an `extensions` map (raw), or `undefined` when
the extension is not validly advertised or its value is not a well-formed
capability. (§26.2, R-26.2-c, R-26.2-d)

## Parameters

### extensionsMap

`unknown`

A host's advertised `extensions` map (raw); typically
  `clientCapabilities.extensions`.

## Returns

`objectOutputType`\<\{ `mimeTypes`: `ZodArray`\<`ZodString`, `"many"`\>; \}, `ZodTypeAny`, `"passthrough"`\> \| `undefined`
