[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / toolsVisibleToModel

# Function: toolsVisibleToModel()

> **toolsVisibleToModel**\<`T`\>(`tools`, `activeSet`): `T`[]

Defined in: [protocol/ui.ts:572](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui.ts#L572)

Filters tools to those visible to the model, applying the §26.3 hide rule:
a tool whose effective UI visibility is `["app"]`-only is omitted from the
model's tool list. (§26.3, R-26.3-f)

The extension must be active for the rule to apply (R-26.3-g): when inactive,
`_meta.ui` is ignored and every tool is treated as an ordinary, model-visible
tool. A tool with no UI declaration is always model-visible.

## Type Parameters

### T

`T`

## Parameters

### tools

readonly `T`[]

The tools to filter.

### activeSet

`Iterable`\<`string`\>

Identifiers active for this interaction.

## Returns

`T`[]
