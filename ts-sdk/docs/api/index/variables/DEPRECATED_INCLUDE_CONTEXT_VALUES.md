[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / DEPRECATED\_INCLUDE\_CONTEXT\_VALUES

# ~~Variable: DEPRECATED\_INCLUDE\_CONTEXT\_VALUES~~

> `const` **DEPRECATED\_INCLUDE\_CONTEXT\_VALUES**: `Set`\<`"thisServer"` \| `"allServers"`\>

Defined in: [protocol/sampling.ts:359](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/sampling.ts#L359)

`includeContext` values that are Deprecated and gated by `sampling.context`. (§21.2.4)

## Deprecated

The `includeContext` values `"thisServer"` and `"allServers"` are
Deprecated (§27.3). No replacement; context management is now host-managed.
Earliest removal: 2026-07-28 (§27.2/§27.3, R-27.4-a/-b).
