[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ToolProtocolError

# Interface: ToolProtocolError

Defined in: [protocol/tools-call.ts:388](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools-call.ts#L388)

A JSON-RPC error payload for a *protocol* failure — the request could not be
dispatched to a tool. This is NEVER a `CallToolResult`; the two layers are
never conflated. (§16.6, R-16.6-a, R-16.6-d)

## Properties

### code

> **code**: `-32602`

Defined in: [protocol/tools-call.ts:390](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools-call.ts#L390)

Error code; for the §16.6 cases this is `-32602` (Invalid params).

***

### message

> **message**: `string`

Defined in: [protocol/tools-call.ts:392](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools-call.ts#L392)

Short, human-readable description.
