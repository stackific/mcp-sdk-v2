[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / COMPLETION\_METHOD\_NOT\_FOUND\_CODE

# Variable: COMPLETION\_METHOD\_NOT\_FOUND\_CODE

> `const` **COMPLETION\_METHOD\_NOT\_FOUND\_CODE**: `-32601`

Defined in: [protocol/completion.ts:90](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/completion.ts#L90)

Error code returned when a server that has NOT advertised the `completions`
capability receives a `completion/complete` request — JSON-RPC `-32601`
(Method not found). (R-19.1-d, R-19.5-q)

Defined locally so this protocol module does not depend on the HTTP transport
layer (which also defines `-32601` as `METHOD_NOT_FOUND_CODE`); S34 owns the
canonical registry entry. Mirrors how `PROMPTS_INTERNAL_ERROR_CODE` is defined
locally in S28's prompts.ts for the same forward-reference reason.
