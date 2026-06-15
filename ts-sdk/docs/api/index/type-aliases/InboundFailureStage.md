[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / InboundFailureStage

# Type Alias: InboundFailureStage

> **InboundFailureStage** = `"unparseable-json"` \| `"invalid-request-object"` \| `"routing-header"` \| `"invalid-metadata"`

Defined in: [protocol/errors.ts:581](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/errors.ts#L581)

The stage at which an inbound message failed validation, used to select the
authoritative `error.code` per the §22.6 classification pipeline. (§22.6)
