[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / RESOURCE\_READ\_INTERNAL\_ERROR\_CODE

# Variable: RESOURCE\_READ\_INTERNAL\_ERROR\_CODE

> `const` **RESOURCE\_READ\_INTERNAL\_ERROR\_CODE**: `-32603`

Defined in: [protocol/resources-read.ts:108](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/resources-read.ts#L108)

The code a server SHOULD return for an internal failure that is unrelated to
the validity of the requested `uri`: `-32603` (Internal error). Defined
locally (mirroring `PROMPTS_INTERNAL_ERROR_CODE` in S18) so this protocol
module does not depend on the HTTP transport layer; S34 owns the canonical
registry entry. (§17.6, R-17.6-d)
