[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / RefreshTokenRequest

# Interface: RefreshTokenRequest

Defined in: [protocol/authorization-flow.ts:1219](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L1219)

The form-encoded token-request body for the refresh-token grant. (§23.9,
R-23.9-e, R-23.9-f)

## Properties

### grant\_type

> **grant\_type**: `"refresh_token"`

Defined in: [protocol/authorization-flow.ts:1221](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L1221)

MUST be `refresh_token`. (R-23.9-e)

***

### refresh\_token

> **refresh\_token**: `string`

Defined in: [protocol/authorization-flow.ts:1223](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L1223)

The refresh token being exchanged. (R-23.9-e)

***

### client\_id

> **client\_id**: `string`

Defined in: [protocol/authorization-flow.ts:1225](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L1225)

The client identifier.

***

### resource

> **resource**: `string`

Defined in: [protocol/authorization-flow.ts:1227](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L1227)

The SAME canonical resource identifier, keeping the token audience-bound. (R-23.9-e)

***

### scope?

> `optional` **scope?**: `string`

Defined in: [protocol/authorization-flow.ts:1229](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L1229)

OPTIONAL narrowed scopes. (R-23.9-f)
