[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ServerTokenValidation

# Type Alias: ServerTokenValidation

> **ServerTokenValidation** = \{ `ok`: `true`; \} \| \{ `ok`: `false`; `reason`: `string`; `code`: *typeof* [`RATE_LIMIT_REJECTION_CODE`](../variables/RATE_LIMIT_REJECTION_CODE.md); \}

Defined in: [protocol/security.ts:756](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L756)

Outcome of [validateServerAccessToken](../functions/validateServerAccessToken.md).
