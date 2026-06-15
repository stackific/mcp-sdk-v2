[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / UiDialectRegistryEntry

# Interface: UiDialectRegistryEntry

Defined in: [protocol/ui-host.ts:187](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui-host.ts#L187)

One row of the §26.6 registry: the verbatim name, its kind, and its direction.

## Properties

### name

> `readonly` **name**: [`UiDialectMethod`](../type-aliases/UiDialectMethod.md)

Defined in: [protocol/ui-host.ts:189](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui-host.ts#L189)

The verbatim, case-sensitive method/notification name. (R-26.5-a)

***

### kind

> `readonly` **kind**: [`UiDialectKind`](../type-aliases/UiDialectKind.md)

Defined in: [protocol/ui-host.ts:191](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui-host.ts#L191)

Whether the message is a request or a notification.

***

### sender

> `readonly` **sender**: [`UiDialectSender`](../type-aliases/UiDialectSender.md)

Defined in: [protocol/ui-host.ts:193](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui-host.ts#L193)

Which side originates the message.
