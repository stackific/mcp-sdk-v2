[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / PromptsGetError

# Interface: PromptsGetError

Defined in: [protocol/prompts.ts:567](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/prompts.ts#L567)

A JSON-RPC error payload returned by the `prompts/get` validators.

## Properties

### code

> **code**: `-32603` \| `-32602`

Defined in: [protocol/prompts.ts:569](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/prompts.ts#L569)

`-32602` for invalid params; `-32603` for an internal failure. (R-18.4-s)

***

### message

> **message**: `string`

Defined in: [protocol/prompts.ts:571](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/prompts.ts#L571)

Short human-readable description.
