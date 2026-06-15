[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / DynamicClientRegistrationResult

# Type Alias: DynamicClientRegistrationResult

> **DynamicClientRegistrationResult** = \{ `ok`: `true`; `response`: [`DynamicClientRegistrationResponse`](DynamicClientRegistrationResponse.md); \} \| \{ `ok`: `false`; `reason`: `string`; `retryable`: `boolean`; \}

Defined in: [protocol/authorization-flow.ts:505](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L505)

The outcome of a DCR registration attempt, modelling the failure cases a client
MUST be prepared to handle. (R-23.4-p, R-23.4-q, R-23.4-r)
