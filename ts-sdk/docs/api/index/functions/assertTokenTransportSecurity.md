[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / assertTokenTransportSecurity

# Function: assertTokenTransportSecurity()

> **assertTokenTransportSecurity**(`options`): [`TokenTransportValidation`](../type-aliases/TokenTransportValidation.md)

Defined in: [protocol/security.ts:882](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L882)

Asserts the §28.5 token-confidentiality transport rules: tokens are stored
securely, never logged, never forwarded to a party other than the one they were
issued for, and authorization-server endpoints and redirect URIs use HTTPS (a
`localhost` redirect is permitted). (§28.5, R-28.5-n, R-28.5-o, R-28.5-p,
R-28.5-q, R-28.9-d; AC-44.17)

A pure policy check over the handling claims and the endpoint/redirect URLs:
returns the first violation. HTTPS is required for every AS endpoint; a redirect
URI may additionally be a loopback (`http://localhost` / `127.0.0.1`).

## Parameters

### options

#### endpointUrls

readonly `string`[]

Authorization-server endpoint URLs (token/authorize/etc.). (R-28.5-q)

#### redirectUris?

readonly `string`[]

The client redirect URIs (loopback http permitted). (R-28.5-q)

#### tokenLogged

`boolean`

Whether any token was written to a log/trace (MUST be false). (R-28.5-o)

#### tokenForwarded

`boolean`

Whether a token was forwarded to a party other than its
  intended one (MUST be false). (R-28.5-p)

## Returns

[`TokenTransportValidation`](../type-aliases/TokenTransportValidation.md)
