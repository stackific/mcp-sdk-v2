[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / RESOURCE\_NOT\_FOUND\_CODE

# Variable: RESOURCE\_NOT\_FOUND\_CODE

> `const` **RESOURCE\_NOT\_FOUND\_CODE**: `-32602` = `INVALID_PARAMS_CODE`

Defined in: [protocol/resources-read.ts:90](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/resources-read.ts#L90)

The code a server MUST return when a requested `uri` does not correspond to a
readable resource: `-32602` (Invalid params). Reuses the canonical
[INVALID\_PARAMS\_CODE](INVALID_PARAMS_CODE.md) from S05/S34. (§17.6, R-17.6-a)

Re-exported under the `RESOURCE_NOT_FOUND` name so resource-read callers can
reference the not-found code without re-importing the generic params code.
