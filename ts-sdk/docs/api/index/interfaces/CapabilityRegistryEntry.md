[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / CapabilityRegistryEntry

# Interface: CapabilityRegistryEntry

Defined in: [protocol/registries.ts:431](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/registries.ts#L431)

One row of Appendix D — a capability defined by this document.

## Properties

### capability

> `readonly` **capability**: `string`

Defined in: [protocol/registries.ts:433](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/registries.ts#L433)

Capability name (for example `tools`, `io.modelcontextprotocol/ui`).

***

### side

> `readonly` **side**: [`CapabilitySide`](../type-aliases/CapabilitySide.md)

Defined in: [protocol/registries.ts:435](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/registries.ts#L435)

Which side(s) advertise the capability.

***

### subFlags

> `readonly` **subFlags**: readonly [`CapabilitySubFlag`](CapabilitySubFlag.md)[]

Defined in: [protocol/registries.ts:437](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/registries.ts#L437)

Nested members defined for the capability (empty when the value is `{}`).

***

### definedIn

> `readonly` **definedIn**: `string`

Defined in: [protocol/registries.ts:439](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/registries.ts#L439)

The section that normatively specifies the capability.

***

### deprecated?

> `readonly` `optional` **deprecated?**: `boolean`

Defined in: [protocol/registries.ts:441](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/registries.ts#L441)

When `true`, the capability as a whole carries Deprecated status.

***

### extension?

> `readonly` `optional` **extension?**: `boolean`

Defined in: [protocol/registries.ts:443](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/registries.ts#L443)

When `true`, the capability is negotiated through the `extensions` map.
