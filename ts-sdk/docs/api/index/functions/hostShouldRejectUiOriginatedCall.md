[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / hostShouldRejectUiOriginatedCall

# Function: hostShouldRejectUiOriginatedCall()

> **hostShouldRejectUiOriginatedCall**(`meta`): `boolean`

Defined in: [protocol/ui.ts:543](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui.ts#L543)

Returns `true` when a host SHOULD REJECT a `tools/call` that originates from a
rendered UI, given the tool's UI declaration: it is rejected exactly when the
tool's effective visibility excludes `"app"`. (§26.3, R-26.3-e)

A tool with no UI declaration (`undefined`) was not exposed to the UI at all;
a UI-originated call for it is likewise rejected.

## Parameters

### meta

`Pick`\<`objectOutputType`\<\{ `resourceUri`: `ZodEffects`\<`ZodString`, `string`, `string`\>; `visibility`: `ZodOptional`\<`ZodArray`\<`ZodEnum`\<\[`"model"`, `"app"`\]\>, `"many"`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `"visibility"`\> \| `undefined`

The tool's [ToolUiMeta](../type-aliases/ToolUiMeta.md), or `undefined` when it has none.

## Returns

`boolean`
