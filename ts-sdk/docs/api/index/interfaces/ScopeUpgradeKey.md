[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ScopeUpgradeKey

# Interface: ScopeUpgradeKey

Defined in: [protocol/authorization-registration.ts:823](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L823)

A scope-upgrade attempt key: the resource-and-operation combination being upgraded. (R-23.18-r)

## Properties

### resource

> **resource**: `string`

Defined in: [protocol/authorization-registration.ts:825](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L825)

The MCP server's canonical resource identifier.

***

### operation

> **operation**: `string`

Defined in: [protocol/authorization-registration.ts:827](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L827)

The operation (e.g. the MCP method) being attempted.
