[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / UI\_DIALECT\_REGISTRY

# Variable: UI\_DIALECT\_REGISTRY

> `const` **UI\_DIALECT\_REGISTRY**: readonly [`UiDialectRegistryEntry`](../interfaces/UiDialectRegistryEntry.md)[]

Defined in: [protocol/ui-host.ts:201](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui-host.ts#L201)

The complete §26.6 registry, in spec order: all 19 distinct names with their
kind and direction. The host validates a dialect message's `method` against
this table byte-for-byte. (§26.6, R-26.5-a; covers AC-42.1)
