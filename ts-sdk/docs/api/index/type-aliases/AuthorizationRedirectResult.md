[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / AuthorizationRedirectResult

# Type Alias: AuthorizationRedirectResult

> **AuthorizationRedirectResult** = \{ `ok`: `true`; `code`: `string`; \} \| \{ `ok`: `false`; `reason`: `string`; `error?`: \{ `error`: `string`; `errorDescription?`: `string`; `errorUri?`: `string`; \}; \}

Defined in: [protocol/authorization-flow.ts:1107](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L1107)

Outcome of [processAuthorizationRedirect](../functions/processAuthorizationRedirect.md).
