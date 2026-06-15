[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / BuildAuthorizationCodeTokenRequestOptions

# Interface: BuildAuthorizationCodeTokenRequestOptions

Defined in: [protocol/authorization-flow.ts:1236](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L1236)

Inputs to [buildAuthorizationCodeTokenRequest](../functions/buildAuthorizationCodeTokenRequest.md).

## Properties

### code

> **code**: `string`

Defined in: [protocol/authorization-flow.ts:1238](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L1238)

The authorization code from the redirect.

***

### redirectUri

> **redirectUri**: `string`

Defined in: [protocol/authorization-flow.ts:1240](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L1240)

MUST be identical to the Step-2 `redirect_uri`. (R-23.5-o)

***

### codeVerifier

> **codeVerifier**: `string`

Defined in: [protocol/authorization-flow.ts:1242](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L1242)

The PKCE verifier from the Step-1 record. (R-23.5-b)

***

### clientId

> **clientId**: `string`

Defined in: [protocol/authorization-flow.ts:1244](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L1244)

The client identifier.

***

### resource

> **resource**: `string`

Defined in: [protocol/authorization-flow.ts:1246](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L1246)

MUST be identical to the Step-2 `resource`. (R-23.5-p)
