[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / parseAuthorizationResponse

# Function: parseAuthorizationResponse()

> **parseAuthorizationResponse**(`redirect`): [`AuthorizationResponseParams`](../interfaces/AuthorizationResponseParams.md)

Defined in: [protocol/authorization-flow.ts:962](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L962)

Parses an authorization-redirect URL (or raw query string) into its decoded
parameters. (§23.5, Step 3 wire example)

Percent-decoding is applied by `URLSearchParams`; the decoded `iss` is then
compared by EXACT string match with no further normalization (R-23.7-g) — this
function performs no normalization beyond the form-decoding the wire requires.

## Parameters

### redirect

`string`

A full redirect URL (`http://…/callback?code=…`) or a bare
  query string (`code=…&state=…`).

## Returns

[`AuthorizationResponseParams`](../interfaces/AuthorizationResponseParams.md)
