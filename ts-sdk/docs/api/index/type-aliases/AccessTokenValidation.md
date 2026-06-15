[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / AccessTokenValidation

# Type Alias: AccessTokenValidation

> **AccessTokenValidation** = \{ `ok`: `true`; \} \| \{ `ok`: `false`; `challenge`: [`UnauthorizedChallenge`](../interfaces/UnauthorizedChallenge.md) \| [`InsufficientScopeChallenge`](../interfaces/InsufficientScopeChallenge.md); \}

Defined in: [protocol/authorization-flow.ts:1577](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L1577)

Outcome of [validateAccessTokenRequest](../functions/validateAccessTokenRequest.md).
