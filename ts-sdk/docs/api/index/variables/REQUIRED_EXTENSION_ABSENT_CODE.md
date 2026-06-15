[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / REQUIRED\_EXTENSION\_ABSENT\_CODE

# Variable: REQUIRED\_EXTENSION\_ABSENT\_CODE

> `const` **REQUIRED\_EXTENSION\_ABSENT\_CODE**: `-32003` = `MISSING_CLIENT_CAPABILITY_CODE`

Defined in: [protocol/extension-mechanism.ts:554](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/extension-mechanism.ts#L554)

The JSON-RPC error code an implementation that MANDATES an extension uses when
the other side does not advertise it and it refuses the interaction. (R-24.7-f)

The framework defines no error code of its own (the story is conceptual); a
mandated-but-absent extension is a "missing required capability" condition, so
this reuses the core `-32003` code (S05/S09 `MISSING_CLIENT_CAPABILITY_CODE`)
rather than minting a new one.
