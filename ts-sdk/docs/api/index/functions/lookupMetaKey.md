[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / lookupMetaKey

# Function: lookupMetaKey()

> **lookupMetaKey**(`key`): [`MetaKeyRegistryEntry`](../interfaces/MetaKeyRegistryEntry.md) \| `undefined`

Defined in: [protocol/registries.ts:355](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/registries.ts#L355)

Looks up the Appendix C entry for an exact reserved `key`, or `undefined` when
the key is not an enumerated registry row. Note this matches the literal rows
only; use [isReservedMetaKey](isReservedMetaKey.md) for the broader prefix-based reservation
test that covers all `io.modelcontextprotocol/…` keys. (Appendix C)

## Parameters

### key

`string`

## Returns

[`MetaKeyRegistryEntry`](../interfaces/MetaKeyRegistryEntry.md) \| `undefined`
