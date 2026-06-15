[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / DirectionalKind

# Type Alias: DirectionalKind

> **DirectionalKind** = `"request"` \| `"notification"` \| `"response"`

Defined in: [transport/contract.ts:130](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/contract.ts#L130)

The structural kind of a message, as classified by S03's `classifyMessage`.
Both response forms share the same directionality, so they collapse here.
