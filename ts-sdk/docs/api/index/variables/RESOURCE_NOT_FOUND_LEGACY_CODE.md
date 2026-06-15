[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / RESOURCE\_NOT\_FOUND\_LEGACY\_CODE

# Variable: RESOURCE\_NOT\_FOUND\_LEGACY\_CODE

> `const` **RESOURCE\_NOT\_FOUND\_LEGACY\_CODE**: `-32002`

Defined in: [protocol/errors.ts:73](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/errors.ts#L73)

The legacy MCP "Resource not found" error code literal, `-32002`. (§22.4)

In §22's registry a `resources/read` for a non-existent URI is canonically a
`-32602` Invalid params condition (R-22.4-g) carrying `data.uri` (R-22.4-h);
the registry also recognizes this dedicated `-32002` literal that the
Resources feature (a concurrent wave) owns. This module does not import that
sibling constant — it pins the numeric literal as registry DATA so the
registry is complete without a forward dependency. The name is suffixed
`_LEGACY_` to stay collision-free with the Resources module's own bindings.
