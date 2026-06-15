[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / parseTokenResponse

# Function: parseTokenResponse()

> **parseTokenResponse**(`value`): [`TokenResponseValidation`](../type-aliases/TokenResponseValidation.md)

Defined in: [protocol/authorization-flow.ts:1386](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L1386)

Parses and validates a token-endpoint response body. (§23.5, R-23.8-b)

Confirms the REQUIRED `access_token`/`token_type` are present and that
`token_type` is `Bearer` (case-insensitive, per RFC 6749) since MCP presents the
token via the `Bearer` scheme (R-23.8-b). The presence of a `refresh_token` is
left to the caller's discretion-aware handling — never assumed (R-23.9-d).

## Parameters

### value

`unknown`

The raw token-endpoint response body.

## Returns

[`TokenResponseValidation`](../type-aliases/TokenResponseValidation.md)
