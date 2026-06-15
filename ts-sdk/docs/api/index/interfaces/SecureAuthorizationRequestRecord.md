[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / SecureAuthorizationRequestRecord

# Interface: SecureAuthorizationRequestRecord

Defined in: [protocol/authorization-registration.ts:1084](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L1084)

The per-request record that MUST hold the recorded issuer, PKCE code verifier,
and `state` together. (R-23.19-e, R-23.19-j, R-23.19-k, R-23.19-l)

Storing all three in one record is what lets the redirect handler validate `iss`
(against `recordedIssuer`), `state`, and PKCE coherently. This mirrors S36's
`AuthorizationFlowRecord`; it is restated here as the §23.19 security invariant
the consolidated check [sameRequestRecord](../functions/sameRequestRecord.md) asserts.

## Properties

### recordedIssuer

> **recordedIssuer**: `string`

Defined in: [protocol/authorization-registration.ts:1086](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L1086)

The validated `issuer`, recorded BEFORE redirect. (R-23.19-e)

***

### codeVerifier

> **codeVerifier**: `string`

Defined in: [protocol/authorization-registration.ts:1088](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L1088)

The PKCE `code_verifier`. (R-23.19-k)

***

### state

> **state**: `string`

Defined in: [protocol/authorization-registration.ts:1090](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L1090)

The unpredictable anti-CSRF `state`. (R-23.19-l)
