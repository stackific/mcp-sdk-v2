[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / AuthorizationCodeTokenRequest

# Interface: AuthorizationCodeTokenRequest

Defined in: [protocol/authorization-flow.ts:1200](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L1200)

The form-encoded token-request body for the authorization-code grant. (§23.5
Step 4, R-23.5-n – R-23.5-p, R-23.6-b)

## Properties

### grant\_type

> **grant\_type**: `"authorization_code"`

Defined in: [protocol/authorization-flow.ts:1202](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L1202)

MUST be `authorization_code`. (R-23.5-n)

***

### code

> **code**: `string`

Defined in: [protocol/authorization-flow.ts:1204](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L1204)

The authorization code from the redirect.

***

### redirect\_uri

> **redirect\_uri**: `string`

Defined in: [protocol/authorization-flow.ts:1206](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L1206)

MUST be identical to the Step-2 `redirect_uri`. (R-23.5-o)

***

### code\_verifier

> **code\_verifier**: `string`

Defined in: [protocol/authorization-flow.ts:1208](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L1208)

The PKCE verifier matching the Step-2 `code_challenge`. (R-23.5-b)

***

### client\_id

> **client\_id**: `string`

Defined in: [protocol/authorization-flow.ts:1210](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L1210)

The client identifier.

***

### resource

> **resource**: `string`

Defined in: [protocol/authorization-flow.ts:1212](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L1212)

MUST be identical to the Step-2 `resource`. (R-23.5-p, R-23.6-b)
