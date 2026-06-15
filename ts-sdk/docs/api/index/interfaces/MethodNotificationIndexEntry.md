[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / MethodNotificationIndexEntry

# Interface: MethodNotificationIndexEntry

Defined in: [protocol/registries.ts:113](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/registries.ts#L113)

One row of Appendix A — a single method or notification name.

## Properties

### name

> `readonly` **name**: `string`

Defined in: [protocol/registries.ts:115](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/registries.ts#L115)

The JSON-RPC method or notification name (for example `tools/list`).

***

### kind

> `readonly` **kind**: [`RegistryMethodKind`](../type-aliases/RegistryMethodKind.md)

Defined in: [protocol/registries.ts:117](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/registries.ts#L117)

Whether the name is a request, a notification, or an input-request kind.

***

### direction

> `readonly` **direction**: `string`

Defined in: [protocol/registries.ts:119](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/registries.ts#L119)

The normal sender→receiver pairing (for example `client→server`).

***

### definedIn

> `readonly` **definedIn**: `string`

Defined in: [protocol/registries.ts:121](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/registries.ts#L121)

The section that normatively defines the message.

***

### extensionScoped?

> `readonly` `optional` **extensionScoped?**: `boolean`

Defined in: [protocol/registries.ts:123](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/registries.ts#L123)

When `true`, the name is only in scope while the named extension is active.
