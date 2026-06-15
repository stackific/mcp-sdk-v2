[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / AuthorizationFlowRecord

# Interface: AuthorizationFlowRecord

Defined in: [protocol/authorization-flow.ts:606](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L606)

Client-side bookkeeping captured in Step 1, associated with the `code_verifier`
(and `state`, if used), to validate the redirect later. (§23.5, R-23.5-c)

## Properties

### codeVerifier

> **codeVerifier**: `string`

Defined in: [protocol/authorization-flow.ts:608](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L608)

The high-entropy PKCE verifier this record is keyed to. (R-23.5-c)

***

### state?

> `optional` **state?**: `string`

Defined in: [protocol/authorization-flow.ts:610](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L610)

The opaque `state` sent, if any. (R-23.5-c, R-23.5-g)

***

### recordedIssuer

> **recordedIssuer**: `string`

Defined in: [protocol/authorization-flow.ts:615](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L615)

The `issuer` from the selected authorization server's validated metadata,
recorded BEFORE redirecting for later `iss` comparison. (R-23.5-c)

***

### codeChallenge

> **codeChallenge**: `string`

Defined in: [protocol/authorization-flow.ts:617](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L617)

The `code_challenge` derived from `codeVerifier`. (R-23.5-b)

***

### codeChallengeMethod

> **codeChallengeMethod**: `"S256"`

Defined in: [protocol/authorization-flow.ts:619](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L619)

The PKCE method; always `S256`. (R-23.5-a)
