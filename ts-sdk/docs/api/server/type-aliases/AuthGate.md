[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [server](../README.md) / AuthGate

# Type Alias: AuthGate

> **AuthGate** = (`request`) => \{ `ok`: `true`; `authInfo?`: `unknown`; \} \| \{ `ok`: `false`; `status`: `number`; `wwwAuthenticate?`: `string`; `body`: `unknown`; \} \| `Promise`\<\{ `ok`: `true`; `authInfo?`: `unknown`; \} \| \{ `ok`: `false`; `status`: `number`; `wwwAuthenticate?`: `string`; `body`: `unknown`; \}\>

Defined in: server/streamable-http.ts:55

Resolves the caller identity for a request, or a challenge to reject it.

## Parameters

### request

`Request`

## Returns

\{ `ok`: `true`; `authInfo?`: `unknown`; \} \| \{ `ok`: `false`; `status`: `number`; `wwwAuthenticate?`: `string`; `body`: `unknown`; \} \| `Promise`\<\{ `ok`: `true`; `authInfo?`: `unknown`; \} \| \{ `ok`: `false`; `status`: `number`; `wwwAuthenticate?`: `string`; `body`: `unknown`; \}\>
