[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / METHOD\_TO\_NOTIFICATION\_MAP

# Variable: METHOD\_TO\_NOTIFICATION\_MAP

> `const` **METHOD\_TO\_NOTIFICATION\_MAP**: `Readonly`\<`Record`\<`string`, `string`\>\>

Defined in: [protocol/caching.ts:189](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/caching.ts#L189)

Maps each cacheable method name to the notification that signals a change.
When the notification arrives the client MUST discard the cached result and
re-fetch. (§13.5, R-13.5-a, R-13.5-j)
