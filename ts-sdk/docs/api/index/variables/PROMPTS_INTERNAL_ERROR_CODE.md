[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / PROMPTS\_INTERNAL\_ERROR\_CODE

# Variable: PROMPTS\_INTERNAL\_ERROR\_CODE

> `const` **PROMPTS\_INTERNAL\_ERROR\_CODE**: `-32603`

Defined in: [protocol/prompts.ts:101](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/prompts.ts#L101)

Error code for an internal failure while resolving a `prompts/get` — maps to
JSON-RPC `-32603` (Internal error). (R-18.4-s)

Defined locally so this protocol module does not depend on the HTTP transport
layer (which also defines `-32603`); S34 owns the canonical registry entry.
