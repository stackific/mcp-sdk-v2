[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / MRTR\_PARTICIPATING\_METHODS

# Variable: MRTR\_PARTICIPATING\_METHODS

> `const` **MRTR\_PARTICIPATING\_METHODS**: `Set`\<`"prompts/get"` \| `"resources/read"` \| `"tools/call"`\>

Defined in: [protocol/multi-round-trip.ts:552](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/multi-round-trip.ts#L552)

The three methods that MAY return `"input_required"` results. (§11.6, R-11.6-a)

A client MUST be prepared to receive `"input_required"` from any of these.
(R-11.6-b)
