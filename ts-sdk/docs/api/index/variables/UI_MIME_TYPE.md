[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / UI\_MIME\_TYPE

# Variable: UI\_MIME\_TYPE

> `const` **UI\_MIME\_TYPE**: `"text/html;profile=mcp-app"`

Defined in: [protocol/ui.ts:86](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui.ts#L86)

The UI resource MIME type, reproduced verbatim and case-sensitively, including
the `;profile=mcp-app` parameter and the ABSENCE of surrounding whitespace.
(§26.2 / §26.4, R-26.2-e, R-26.4-d)

A host that supports the extension MUST include this exact string in its
advertised `mimeTypes`; a UI resource MUST be served with this exact type.
`"text/html; profile=mcp-app"` (extra space) and `"TEXT/HTML;PROFILE=MCP-APP"`
(wrong case) do NOT satisfy the requirement.
