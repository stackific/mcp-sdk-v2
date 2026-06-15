[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / CursorSchema

# Variable: CursorSchema

> `const` **CursorSchema**: `ZodString`

Defined in: [jsonrpc/payload.ts:198](https://github.com/stackific/mcp-sdk-node/blob/main/src/jsonrpc/payload.ts#L198)

An opaque pagination token referenced by paginated methods. (§3.7)

Canonical type home: §3.7 (Appendix E). Use in list operations is defined
in §12 / S18. Receivers MUST NOT parse or infer structure from a cursor value.
(R-3.7-d)
