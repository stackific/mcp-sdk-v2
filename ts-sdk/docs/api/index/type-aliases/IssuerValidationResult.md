[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / IssuerValidationResult

# Type Alias: IssuerValidationResult

> **IssuerValidationResult** = \{ `ok`: `true`; `decision`: `"compare"` \| `"proceed"`; \} \| \{ `ok`: `false`; `reason`: `string`; \}

Defined in: [protocol/authorization-flow.ts:1024](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L1024)

Outcome of [validateIssuer](../functions/validateIssuer.md): whether the code may be redeemed.
