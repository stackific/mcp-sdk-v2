[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / TokenValidationContext

# Interface: TokenValidationContext

Defined in: [protocol/authorization-flow.ts:1555](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L1555)

A description of what an operation requires, against which the MCP server
validates a presented token on every request. (R-23.8-d)

## Properties

### ownCanonicalResource

> **ownCanonicalResource**: `string`

Defined in: [protocol/authorization-flow.ts:1557](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L1557)

This server's canonical resource identifier (the expected audience). (R-23.8-d)

***

### requiredScopes?

> `optional` **requiredScopes?**: `string`[]

Defined in: [protocol/authorization-flow.ts:1559](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L1559)

The scopes this specific operation requires; empty when none. (R-23.8-d, R-23.8-f)

***

### resourceMetadata

> **resourceMetadata**: `string`

Defined in: [protocol/authorization-flow.ts:1561](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L1561)

The protected-resource metadata URI for the `WWW-Authenticate` challenge.
