[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ElicitContentError

# Interface: ElicitContentError

Defined in: [protocol/elicitation-form.ts:642](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/elicitation-form.ts#L642)

One failure reported by [validateElicitContent](../functions/validateElicitContent.md).

## Properties

### path

> **path**: `string`

Defined in: [protocol/elicitation-form.ts:644](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/elicitation-form.ts#L644)

The offending field name, or `<root>` for a top-level shape problem.

***

### detail

> **detail**: `string`

Defined in: [protocol/elicitation-form.ts:646](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/elicitation-form.ts#L646)

Human-readable detail.
