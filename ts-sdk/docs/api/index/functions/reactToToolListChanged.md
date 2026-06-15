[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / reactToToolListChanged

# Function: reactToToolListChanged()

> **reactToToolListChanged**(): [`ToolListChangedReaction`](../interfaces/ToolListChangedReaction.md)

Defined in: [protocol/tools-call.ts:656](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools-call.ts#L656)

Returns the prescribed client reaction to a `notifications/tools/list_changed`:
invalidate any cached tool list (SHOULD) and optionally re-list (MAY). This
encodes the §16.8 client guidance as a value a caller can act on. (R-16.8-c,
R-16.8-d)

## Returns

[`ToolListChangedReaction`](../interfaces/ToolListChangedReaction.md)
