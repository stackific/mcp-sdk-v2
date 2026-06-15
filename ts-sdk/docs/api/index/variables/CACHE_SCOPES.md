[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / CACHE\_SCOPES

# Variable: CACHE\_SCOPES

> `const` **CACHE\_SCOPES**: readonly \[`"public"`, `"private"`\]

Defined in: [protocol/caching.ts:33](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/caching.ts#L33)

The two sharing-scope values for a cached result. (§13.3)

`"public"` — any client or shared intermediary may reuse the stored copy
for any user, subject to the freshness interval. (R-13.3-a)

`"private"` — may be stored and reused only within the single authorization
context that made the request. A shared intermediary MUST NOT serve a stored
`"private"` copy to a different user. (R-13.3-b, R-13.3-c)

Any unrecognized or absent value MUST be treated as `"private"`. (R-13.1-e)
