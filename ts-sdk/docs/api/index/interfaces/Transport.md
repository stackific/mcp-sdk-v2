[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / Transport

# Interface: Transport

Defined in: [transport/contract.ts:87](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/contract.ts#L87)

The abstract transport contract every defined or custom transport satisfies.
(§7.1, §7.2)

A `Transport` is a bidirectional channel that carries the `JSONRPCMessage`
union as complete UTF-8 JSON values, preserves integrity, delivers in both
directions, never silently drops a message, and defines an observable clean
close and an observable abrupt disconnection.

A transport does NOT interpret method/params/result or perform capability or
version negotiation; those are core-protocol concerns carried unchanged.

## Properties

### closed

> `readonly` **closed**: `boolean`

Defined in: [transport/contract.ts:118](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/contract.ts#L118)

`true` once the channel has been closed or disconnected.

## Methods

### send()

> **send**(`message`): `void` \| `Promise`\<`void`\>

Defined in: [transport/contract.ts:94](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/contract.ts#L94)

Sends one message over the channel. MUST NOT silently drop it: on a closed
or failed channel this MUST surface an observable failure (e.g. throw or
reject with a `TransportError`) rather than discarding the message.
(R-7.2-q, R-7.2-s, R-7.5-i, R-7.5-j)

#### Parameters

##### message

[`JSONRPCMessage`](../type-aliases/JSONRPCMessage.md)

#### Returns

`void` \| `Promise`\<`void`\>

***

### onMessage()

> **onMessage**(`handler`): [`Unsubscribe`](../type-aliases/Unsubscribe.md)

Defined in: [transport/contract.ts:96](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/contract.ts#L96)

Registers a handler for each inbound message. Returns an unsubscribe fn.

#### Parameters

##### handler

(`message`) => `void`

#### Returns

[`Unsubscribe`](../type-aliases/Unsubscribe.md)

***

### onError()

> **onError**(`handler`): [`Unsubscribe`](../type-aliases/Unsubscribe.md)

Defined in: [transport/contract.ts:108](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/contract.ts#L108)

Registers a handler for **receiver-side** transport/parse-level errors —
e.g. an inbound unit that is not well-formed UTF-8 or not a single JSON
value (R-7.6-b, R-7.6-c). These surface on the side that *received* the bad
unit, as an observable failure, rather than being silently dropped or
thrown back into the unrelated sender's `send`. (R-7.5-j) Returns an
unsubscribe fn.

This is distinct from a JSON-RPC error response (a normal, fully delivered
message) and from a send failure (surfaced synchronously by `send`).

#### Parameters

##### handler

(`error`) => `void`

#### Returns

[`Unsubscribe`](../type-aliases/Unsubscribe.md)

***

### onClose()

> **onClose**(`handler`): [`Unsubscribe`](../type-aliases/Unsubscribe.md)

Defined in: [transport/contract.ts:114](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/contract.ts#L114)

Registers a handler invoked once when the channel becomes unusable — by a
clean close or an abrupt disconnection (R-7.2-t, R-7.5-a). Returns an
unsubscribe fn.

#### Parameters

##### handler

(`info`) => `void`

#### Returns

[`Unsubscribe`](../type-aliases/Unsubscribe.md)

***

### close()

> **close**(`reason?`): `void` \| `Promise`\<`void`\>

Defined in: [transport/contract.ts:116](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/contract.ts#L116)

Initiates an orderly (clean) close that each side can observe. (R-7.2-t)

#### Parameters

##### reason?

`string`

#### Returns

`void` \| `Promise`\<`void`\>
