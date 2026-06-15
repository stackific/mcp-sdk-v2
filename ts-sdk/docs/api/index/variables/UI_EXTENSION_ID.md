[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / UI\_EXTENSION\_ID

# Variable: UI\_EXTENSION\_ID

> `const` **UI\_EXTENSION\_ID**: `"io.modelcontextprotocol/ui"`

Defined in: [protocol/ui.ts:74](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui.ts#L74)

The Interactive UI ("apps") extension identifier: the exact, opaque,
case-sensitive string used as a key in the `extensions` capability map.
(§26.2, R-26.2-b)

A receiver MUST treat this as an opaque, case-sensitive string — compare with
[extensionIdsMatch](../functions/extensionIdsMatch.md) (S38), never with case folding, so
`IO.ModelContextProtocol/UI` does NOT match. (R-26.2-b)
