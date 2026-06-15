[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / MetaKeyRegistryEntry

# Interface: MetaKeyRegistryEntry

Defined in: [protocol/registries.ts:240](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/registries.ts#L240)

One row of Appendix C — a reserved key that MAY appear in `_meta`.

## Properties

### key

> `readonly` **key**: `string`

Defined in: [protocol/registries.ts:242](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/registries.ts#L242)

The reserved `_meta` key (prefixed or bare-by-exception).

***

### usedOn

> `readonly` **usedOn**: `string`

Defined in: [protocol/registries.ts:244](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/registries.ts#L244)

Where the key normally appears.

***

### meaning

> `readonly` **meaning**: `string`

Defined in: [protocol/registries.ts:246](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/registries.ts#L246)

Purpose, requirement level, and deprecation status where applicable.

***

### definedIn

> `readonly` **definedIn**: `string`

Defined in: [protocol/registries.ts:248](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/registries.ts#L248)

The section that normatively specifies the key.

***

### requirement

> `readonly` **requirement**: `"required"` \| `"optional"`

Defined in: [protocol/registries.ts:250](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/registries.ts#L250)

Requirement level on the location named in `usedOn`.

***

### deprecated?

> `readonly` `optional` **deprecated?**: `boolean`

Defined in: [protocol/registries.ts:252](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/registries.ts#L252)

When `true`, the key carries Deprecated status.
