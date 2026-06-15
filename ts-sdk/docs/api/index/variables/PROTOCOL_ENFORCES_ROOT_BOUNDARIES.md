[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / PROTOCOL\_ENFORCES\_ROOT\_BOUNDARIES

# Variable: PROTOCOL\_ENFORCES\_ROOT\_BOUNDARIES

> `const` **PROTOCOL\_ENFORCES\_ROOT\_BOUNDARIES**: `false`

Defined in: [protocol/roots.ts:524](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/roots.ts#L524)

`false` — a server MUST NOT assume the protocol enforces root boundaries on
its behalf; roots are informational guidance, not an access-control
mechanism. (R-21.1.5-l · MUST NOT; AC-32.18)

Exposed as a named constant so server code can assert it never relies on
protocol-level enforcement.
