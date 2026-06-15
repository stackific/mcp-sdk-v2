[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isConfidentialToken

# Function: isConfidentialToken()

> **isConfidentialToken**(): `boolean`

Defined in: [protocol/authorization-registration.ts:1130](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L1130)

Returns `true` when a value MUST NOT be logged or forwarded because it is an
access or refresh token — the token-confidentiality guard. Always `true`: access
and refresh tokens MUST NOT be logged and MUST NOT be forwarded to third
parties. (R-23.19-m, R-23.19-n)

Use to gate logging/forwarding sinks: `if (isConfidentialToken()) skipLogging()`.
It takes no token argument by design — the rule is unconditional, so it never
incentivizes passing a token where it might be captured.

## Returns

`boolean`
