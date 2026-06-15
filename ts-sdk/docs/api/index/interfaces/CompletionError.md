[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / CompletionError

# Interface: CompletionError

Defined in: [protocol/completion.ts:566](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/completion.ts#L566)

A JSON-RPC error payload returned by the completion validators.

## Properties

### code

> **code**: `-32603` \| `-32602` \| `-32601`

Defined in: [protocol/completion.ts:572](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/completion.ts#L572)

`-32601` (no `completions` capability), `-32602` (invalid params / unknown
ref / unknown argument), or `-32603` (internal failure). (R-19.1-d,
R-19.5-r – R-19.5-t)

***

### message

> **message**: `string`

Defined in: [protocol/completion.ts:577](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/completion.ts#L577)

Short human-readable description.
