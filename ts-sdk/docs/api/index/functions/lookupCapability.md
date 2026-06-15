[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / lookupCapability

# Function: lookupCapability()

> **lookupCapability**(`capability`, `side?`): [`CapabilityRegistryEntry`](../interfaces/CapabilityRegistryEntry.md) \| `undefined`

Defined in: [protocol/registries.ts:555](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/registries.ts#L555)

Looks up the Appendix D entry for `capability`. When the same name is defined
on more than one side (`extensions` is both a client and a server capability),
pass `side` to disambiguate; otherwise the first match is returned. Returns
`undefined` when the capability is not in the registry. (Appendix D)

## Parameters

### capability

`string`

### side?

[`CapabilitySide`](../type-aliases/CapabilitySide.md)

## Returns

[`CapabilityRegistryEntry`](../interfaces/CapabilityRegistryEntry.md) \| `undefined`
