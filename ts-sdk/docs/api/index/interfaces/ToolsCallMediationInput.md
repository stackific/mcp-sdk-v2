[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ToolsCallMediationInput

# Interface: ToolsCallMediationInput

Defined in: [protocol/ui-host.ts:899](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui-host.ts#L899)

The host's per-request mediation policy inputs for a UI-initiated `tools/call`.
A host MUST mediate the request: route it to the server ONLY after obtaining
user consent and applying its policy, and SHOULD reject it when the named
tool's effective `visibility` does not include `"app"`. (§26.5.3, §26.7,
R-26.5.3-a/b, R-26.7-i/j/k; AC-42.5, AC-42.6)

## Properties

### uiMeta

> `readonly` **uiMeta**: `Pick`\<`objectOutputType`\<\{ `resourceUri`: `ZodEffects`\<`ZodString`, `string`, `string`\>; `visibility`: `ZodOptional`\<`ZodArray`\<`ZodEnum`\<\[`"model"`, `"app"`\]\>, `"many"`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `"visibility"`\> \| `undefined`

Defined in: [protocol/ui-host.ts:901](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui-host.ts#L901)

The tool's UI declaration (S41 `_meta.ui`), or `undefined` if it has none.

***

### userConsented

> `readonly` **userConsented**: `boolean`

Defined in: [protocol/ui-host.ts:903](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui-host.ts#L903)

Whether the user has granted consent for this invocation. (R-26.7-j)

***

### policyAllows

> `readonly` **policyAllows**: `boolean`

Defined in: [protocol/ui-host.ts:905](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui-host.ts#L905)

Whether the host's tool-execution policy permits this invocation. (R-26.7-j)
