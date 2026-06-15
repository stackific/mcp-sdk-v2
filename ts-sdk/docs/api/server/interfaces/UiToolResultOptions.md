[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [server](../README.md) / UiToolResultOptions

# Interface: UiToolResultOptions

Defined in: server/ui.ts:27

Options for [uiToolResult](../functions/uiToolResult.md).

## Properties

### text?

> `optional` **text?**: `string`

Defined in: server/ui.ts:29

Leading text content block (a human-readable note).

***

### visibility?

> `optional` **visibility?**: (`"model"` \| `"app"`)[]

Defined in: server/ui.ts:31

Which actors may invoke the tool; omitted ⇒ `["model","app"]`. (§26.3)
