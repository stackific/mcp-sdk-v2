[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / RestrictedFormSchemaError

# Interface: RestrictedFormSchemaError

Defined in: [protocol/elicitation-form.ts:463](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/elicitation-form.ts#L463)

One failure reported by [validateRestrictedFormSchema](../functions/validateRestrictedFormSchema.md).

## Properties

### path

> **path**: `string`

Defined in: [protocol/elicitation-form.ts:465](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/elicitation-form.ts#L465)

A dotted path to the offending node (e.g. `properties.age`).

***

### detail

> **detail**: `string`

Defined in: [protocol/elicitation-form.ts:467](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/elicitation-form.ts#L467)

Human-readable detail.
