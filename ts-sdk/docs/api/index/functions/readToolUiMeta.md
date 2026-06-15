[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / readToolUiMeta

# Function: readToolUiMeta()

> **readToolUiMeta**(`tool`, `activeSet`): `objectOutputType`\<\{ `resourceUri`: `ZodEffects`\<`ZodString`, `string`, `string`\>; `visibility`: `ZodOptional`\<`ZodArray`\<`ZodEnum`\<\[`"model"`, `"app"`\]\>, `"many"`\>\>; \}, `ZodTypeAny`, `"passthrough"`\> \| `undefined`

Defined in: [protocol/ui.ts:505](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui.ts#L505)

Reads a tool's UI declaration ONLY when the extension is active for the
interaction; returns `undefined` when the extension is not active, modeling
"a receiver that does not negotiate this extension MUST ignore the `_meta.ui`
key". (§26.3, R-26.3-g, R-26.2-i)

When inactive the tool is treated as a normal tool and the key is ignored —
its presence MUST NOT change the behavior of an ordinary `tools/call`
(R-26.3-h); this read simply yields no declaration.

## Parameters

### tool

`unknown`

The tool object.

### activeSet

`Iterable`\<`string`\>

Identifiers active for this interaction.

## Returns

`objectOutputType`\<\{ `resourceUri`: `ZodEffects`\<`ZodString`, `string`, `string`\>; `visibility`: `ZodOptional`\<`ZodArray`\<`ZodEnum`\<\[`"model"`, `"app"`\]\>, `"many"`\>\>; \}, `ZodTypeAny`, `"passthrough"`\> \| `undefined`
