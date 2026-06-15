[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / PROTOCOL\_VERSION\_META\_KEY

# Variable: PROTOCOL\_VERSION\_META\_KEY

> `const` **PROTOCOL\_VERSION\_META\_KEY**: `"io.modelcontextprotocol/protocolVersion"`

Defined in: [protocol/meta.ts:62](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/meta.ts#L62)

The three reserved `io.modelcontextprotocol/*` keys that are REQUIRED in the
`_meta` of every client request. (§4.3, R-4.3-a – R-4.3-c)

Exported as named constants so that every module that constructs or inspects
a request envelope — discovery (S08), the transport contract (S12), and any
later feature — references the same canonical key strings instead of
re-typing the literals.
