[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / UnsupportedProtocolVersionData

# Interface: UnsupportedProtocolVersionData

Defined in: [protocol/discovery.ts:169](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/discovery.ts#L169)

The REQUIRED `data` payload of an `UnsupportedProtocolVersion` error. (§5.5)

## Properties

### supported

> **supported**: `string`[]

Defined in: [protocol/discovery.ts:171](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/discovery.ts#L171)

The revisions the server supports — informs the client even on failure.

***

### requested

> **requested**: `string`

Defined in: [protocol/discovery.ts:173](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/discovery.ts#L173)

The (unsupported) revision the client requested; echoed back.
