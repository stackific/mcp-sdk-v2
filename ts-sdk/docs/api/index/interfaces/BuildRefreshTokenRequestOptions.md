[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / BuildRefreshTokenRequestOptions

# Interface: BuildRefreshTokenRequestOptions

Defined in: [protocol/authorization-flow.ts:1274](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L1274)

Inputs to [buildRefreshTokenRequest](../functions/buildRefreshTokenRequest.md).

## Properties

### refreshToken

> **refreshToken**: `string`

Defined in: [protocol/authorization-flow.ts:1276](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L1276)

The refresh token being exchanged. (R-23.9-e)

***

### clientId

> **clientId**: `string`

Defined in: [protocol/authorization-flow.ts:1278](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L1278)

The client identifier.

***

### resource

> **resource**: `string`

Defined in: [protocol/authorization-flow.ts:1280](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L1280)

The SAME canonical resource identifier as Step 2. (R-23.9-e)

***

### scope?

> `optional` **scope?**: `string`

Defined in: [protocol/authorization-flow.ts:1282](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L1282)

OPTIONAL narrowed scopes. (R-23.9-f)
