[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ResolvedToolAnnotationHints

# Interface: ResolvedToolAnnotationHints

Defined in: [protocol/tools-call.ts:520](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools-call.ts#L520)

The `ToolAnnotations` boolean hints with the §16.7 defaults applied.

## Properties

### readOnlyHint

> **readOnlyHint**: `boolean`

Defined in: [protocol/tools-call.ts:522](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools-call.ts#L522)

Default `false`. (R-16.7-b)

***

### destructiveHint

> **destructiveHint**: `boolean`

Defined in: [protocol/tools-call.ts:524](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools-call.ts#L524)

Default `true`; meaningful only when `readOnlyHint` is `false`. (R-16.7-c)

***

### idempotentHint

> **idempotentHint**: `boolean`

Defined in: [protocol/tools-call.ts:526](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools-call.ts#L526)

Default `false`; meaningful only when `readOnlyHint` is `false`. (R-16.7-d)

***

### openWorldHint

> **openWorldHint**: `boolean`

Defined in: [protocol/tools-call.ts:528](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools-call.ts#L528)

Default `true`. (R-16.7-e)
