[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / PAGINATED\_METHODS

# Variable: PAGINATED\_METHODS

> `const` **PAGINATED\_METHODS**: `Set`\<`"prompts/list"` \| `"resources/list"` \| `"tools/list"` \| `"resources/templates/list"`\>

Defined in: [protocol/pagination.ts:230](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/pagination.ts#L230)

The set of method names whose results carry `PaginatedResult` shapes. (§12)

All four methods support optional `cursor` on the request and optional
`nextCursor` on the result. Their list-specific payloads are defined in the
respective feature stories (S24, S26, S28).
