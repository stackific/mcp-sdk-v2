[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ToolListChangedReaction

# Interface: ToolListChangedReaction

Defined in: [protocol/tools-call.ts:643](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools-call.ts#L643)

The client-side reaction to a received list-changed notification. (§16.8)

## Properties

### invalidateCachedToolList

> **invalidateCachedToolList**: `true`

Defined in: [protocol/tools-call.ts:645](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools-call.ts#L645)

A client SHOULD invalidate any cached tool list (S19). (R-16.8-c)

***

### mayRelist

> **mayRelist**: `true`

Defined in: [protocol/tools-call.ts:647](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools-call.ts#L647)

A client MAY issue a fresh `tools/list` request to obtain the updated set. (R-16.8-d)
