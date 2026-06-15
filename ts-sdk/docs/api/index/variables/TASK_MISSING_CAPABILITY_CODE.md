[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / TASK\_MISSING\_CAPABILITY\_CODE

# Variable: TASK\_MISSING\_CAPABILITY\_CODE

> `const` **TASK\_MISSING\_CAPABILITY\_CODE**: `-32003` = `MISSING_CLIENT_CAPABILITY_CODE`

Defined in: [protocol/tasks.ts:642](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tasks.ts#L642)

The §22 error code a server uses when a client invokes a Tasks method against
a server that has not advertised the extension, or invokes a method the server
cannot service: the missing-required-capability condition `-32003`. (§25.2,
R-25.2-f)

Reuses the core [MISSING\_CLIENT\_CAPABILITY\_CODE](MISSING_CLIENT_CAPABILITY_CODE.md) (S05) — the §22
missing-capability condition — rather than minting a Tasks-specific code.
