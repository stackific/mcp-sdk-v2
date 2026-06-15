[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / COMPLETION\_INVALID\_PARAMS\_CODE

# Variable: COMPLETION\_INVALID\_PARAMS\_CODE

> `const` **COMPLETION\_INVALID\_PARAMS\_CODE**: `-32602` = `INVALID_PARAMS_CODE`

Defined in: [protocol/completion.ts:101](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/completion.ts#L101)

Error code for invalid `completion/complete` params — a missing `ref`, a
`ref.type` outside the closed union, a missing/malformed `argument`
name/value, an unknown prompt or resource template, or an `argument.name` that
is not a valid argument of the referenced target. Maps to JSON-RPC `-32602`
(Invalid params). (R-19.5-r, R-19.5-s)

Reuses the canonical `INVALID_PARAMS_CODE` from S05's meta.ts (same binding).
