[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ContinuationTokenValidation

# Type Alias: ContinuationTokenValidation\<S\>

> **ContinuationTokenValidation**\<`S`\> = \{ `ok`: `true`; `state`: `S`; \} \| \{ `ok`: `false`; `reason`: `"integrity-failure"` \| `"expired"` \| `"replayed"` \| `"unknown"`; `detail`: `string`; \}

Defined in: [protocol/security.ts:954](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L954)

Outcome of validateContinuationToken.

## Type Parameters

### S

`S` = `unknown`
