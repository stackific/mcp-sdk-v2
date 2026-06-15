[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isAppInvokable

# Function: isAppInvokable()

> **isAppInvokable**(`meta`): `boolean`

Defined in: [protocol/ui.ts:529](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui.ts#L529)

Returns `true` when a tool's effective visibility includes `"app"` — i.e. the
rendered UI MAY invoke it over the channel. A host SHOULD reject a
UI-originated `tools/call` for a tool whose effective `visibility` does NOT
include `"app"`. (§26.3, R-26.3-e)

## Parameters

### meta

`Pick`\<[`ToolUiMeta`](../type-aliases/ToolUiMeta.md), `"visibility"`\>

The tool's [ToolUiMeta](../type-aliases/ToolUiMeta.md).

## Returns

`boolean`
