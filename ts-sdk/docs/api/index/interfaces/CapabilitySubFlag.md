[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / CapabilitySubFlag

# Interface: CapabilitySubFlag

Defined in: [protocol/registries.ts:417](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/registries.ts#L417)

A single nested sub-flag of a capability, with its optionality and notes.

## Properties

### name

> `readonly` **name**: `string`

Defined in: [protocol/registries.ts:419](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/registries.ts#L419)

The sub-flag member name (for example `listChanged`, `form`, `mimeTypes`).

***

### requirement

> `readonly` **requirement**: `"required"` \| `"optional"`

Defined in: [protocol/registries.ts:421](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/registries.ts#L421)

Requirement level of the sub-flag.

***

### boolean?

> `readonly` `optional` **boolean?**: `boolean`

Defined in: [protocol/registries.ts:423](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/registries.ts#L423)

When `true`, the sub-flag is a boolean toggle.

***

### deprecated?

> `readonly` `optional` **deprecated?**: `boolean`

Defined in: [protocol/registries.ts:425](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/registries.ts#L425)

When `true`, the sub-flag carries Deprecated status.

***

### gates

> `readonly` **gates**: `string`

Defined in: [protocol/registries.ts:427](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/registries.ts#L427)

One-line statement of what the sub-flag gates or carries.
