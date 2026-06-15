[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / PresentedToken

# Interface: PresentedToken

Defined in: [protocol/authorization-flow.ts:1565](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L1565)

The validated facts about a presented token, supplied by signature/introspection.

## Properties

### active

> **active**: `boolean`

Defined in: [protocol/authorization-flow.ts:1567](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L1567)

Whether the signature or introspection result is valid. (R-23.8-d)

***

### expired

> **expired**: `boolean`

Defined in: [protocol/authorization-flow.ts:1569](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L1569)

Whether the token is unexpired. (R-23.8-d)

***

### audience

> **audience**: `string` \| `string`[]

Defined in: [protocol/authorization-flow.ts:1571](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L1571)

The token's audience claim. (R-23.8-d)

***

### scopes

> **scopes**: `string`[]

Defined in: [protocol/authorization-flow.ts:1573](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L1573)

The scopes the token grants. (R-23.8-d)
