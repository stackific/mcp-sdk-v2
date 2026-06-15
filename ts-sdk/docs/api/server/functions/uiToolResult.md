[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [server](../README.md) / uiToolResult

# Function: uiToolResult()

> **uiToolResult**(`uri`, `html`, `options?`): `object`

Defined in: server/ui.ts:39

Builds a tool result that launches an MCP App: it embeds the `ui://` resource
(with the `text/html;profile=mcp-app` MIME) and declares the UI under the
`_meta.ui` key as `{ resourceUri, visibility? }` per the Apps extension. (§26.3)

## Parameters

### uri

`string`

### html

`string`

### options?

[`UiToolResultOptions`](../interfaces/UiToolResultOptions.md) = `{}`

## Returns

`object`

### content

> **content**: `unknown`[]

### \_meta

> **\_meta**: `Record`\<`string`, `unknown`\>
