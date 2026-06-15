[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / resourceIdentifiersEqual

# Function: resourceIdentifiersEqual()

> **resourceIdentifiersEqual**(`a`, `b`): `boolean`

Defined in: [protocol/authorization.ts:308](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization.ts#L308)

Returns `a` and `b` compared as canonical resource identifiers, accepting
uppercase scheme/host on either side. (R-23.1-p)

The canonical form is lowercase scheme + host, but a receiver SHOULD accept
uppercase scheme and host components for robustness; this canonicalizes both
sides before comparing so `HTTPS://MCP.EXAMPLE.COM/mcp` matches
`https://mcp.example.com/mcp`. Returns `false` when either side is not a valid
identifier. Path, query, and port are compared case-sensitively (only scheme
and host are case-insensitive).

## Parameters

### a

`string`

One resource identifier.

### b

`string`

The other resource identifier.

## Returns

`boolean`
