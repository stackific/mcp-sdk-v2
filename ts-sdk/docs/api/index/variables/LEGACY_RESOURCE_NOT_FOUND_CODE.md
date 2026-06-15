[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / LEGACY\_RESOURCE\_NOT\_FOUND\_CODE

# Variable: LEGACY\_RESOURCE\_NOT\_FOUND\_CODE

> `const` **LEGACY\_RESOURCE\_NOT\_FOUND\_CODE**: `-32002`

Defined in: [protocol/resources-read.ts:99](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/resources-read.ts#L99)

The LEGACY resource-not-found code, `-32002`. An earlier protocol revision
used this code for the not-found condition; for interoperability a client
SHOULD treat it as resource-not-found in ADDITION to `-32602`. A modern
server MUST NOT mint it — [buildResourceNotFoundError](../functions/buildResourceNotFoundError.md) emits `-32602`.
(§17.6, R-17.6-c)
