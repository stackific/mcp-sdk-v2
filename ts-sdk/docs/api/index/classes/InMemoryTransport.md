[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / InMemoryTransport

# Class: InMemoryTransport

Defined in: [transport/in-memory.ts:32](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/in-memory.ts#L32)

One endpoint of an in-memory transport pair. Construct pairs via
[createInMemoryTransportPair](../functions/createInMemoryTransportPair.md) rather than directly.

## Implements

- [`Transport`](../interfaces/Transport.md)

## Constructors

### Constructor

> **new InMemoryTransport**(): `InMemoryTransport`

#### Returns

`InMemoryTransport`

## Accessors

### closed

#### Get Signature

> **get** **closed**(): `boolean`

Defined in: [transport/in-memory.ts:176](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/in-memory.ts#L176)

`true` once the channel has been closed or disconnected.

##### Returns

`boolean`

`true` once the channel has been closed or disconnected.

#### Implementation of

[`Transport`](../interfaces/Transport.md).[`closed`](../interfaces/Transport.md#closed)

## Methods

### link()

> **link**(`peer`): `void`

Defined in: [transport/in-memory.ts:47](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/in-memory.ts#L47)

Links this endpoint to its peer. Internal — used by the factory.

#### Parameters

##### peer

`InMemoryTransport`

#### Returns

`void`

***

### send()

> **send**(`message`): `void`

Defined in: [transport/in-memory.ts:51](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/in-memory.ts#L51)

Sends one message over the channel. MUST NOT silently drop it: on a closed
or failed channel this MUST surface an observable failure (e.g. throw or
reject with a `TransportError`) rather than discarding the message.
(R-7.2-q, R-7.2-s, R-7.5-i, R-7.5-j)

#### Parameters

##### message

[`JSONRPCMessage`](../type-aliases/JSONRPCMessage.md)

#### Returns

`void`

#### Implementation of

[`Transport`](../interfaces/Transport.md).[`send`](../interfaces/Transport.md#send)

***

### injectRawBytes()

> **injectRawBytes**(`bytes`): `void`

Defined in: [transport/in-memory.ts:94](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/in-memory.ts#L94)

Feeds arbitrary raw bytes into this endpoint's receive path, as if they had
arrived on the wire. Used to exercise receiver-side decode-error handling
(e.g. a corrupt or non-UTF-8 unit). Not part of the `Transport` contract —
a test/simulation affordance.

#### Parameters

##### bytes

`Uint8Array`

#### Returns

`void`

***

### onMessage()

> **onMessage**(`handler`): [`Unsubscribe`](../type-aliases/Unsubscribe.md)

Defined in: [transport/in-memory.ts:118](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/in-memory.ts#L118)

Registers a handler for each inbound message. Returns an unsubscribe fn.

#### Parameters

##### handler

(`message`) => `void`

#### Returns

[`Unsubscribe`](../type-aliases/Unsubscribe.md)

#### Implementation of

[`Transport`](../interfaces/Transport.md).[`onMessage`](../interfaces/Transport.md#onmessage)

***

### onError()

> **onError**(`handler`): [`Unsubscribe`](../type-aliases/Unsubscribe.md)

Defined in: [transport/in-memory.ts:133](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/in-memory.ts#L133)

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

#### Implementation of

[`Transport`](../interfaces/Transport.md).[`onError`](../interfaces/Transport.md#onerror)

***

### onClose()

> **onClose**(`handler`): [`Unsubscribe`](../type-aliases/Unsubscribe.md)

Defined in: [transport/in-memory.ts:148](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/in-memory.ts#L148)

Registers a handler invoked once when the channel becomes unusable — by a
clean close or an abrupt disconnection (R-7.2-t, R-7.5-a). Returns an
unsubscribe fn.

#### Parameters

##### handler

(`info`) => `void`

#### Returns

[`Unsubscribe`](../type-aliases/Unsubscribe.md)

#### Implementation of

[`Transport`](../interfaces/Transport.md).[`onClose`](../interfaces/Transport.md#onclose)

***

### close()

> **close**(`reason?`): `void`

Defined in: [transport/in-memory.ts:161](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/in-memory.ts#L161)

Initiates an orderly close observable by both endpoints. (R-7.2-t)

#### Parameters

##### reason?

`string`

#### Returns

`void`

#### Implementation of

[`Transport`](../interfaces/Transport.md).[`close`](../interfaces/Transport.md#close)

***

### disconnect()

> **disconnect**(`reason?`): `void`

Defined in: [transport/in-memory.ts:172](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/in-memory.ts#L172)

Simulates an abrupt disconnection (channel dropped without an orderly
close). Both endpoints observe it via `onClose` with `clean: false`, so
neither side blocks as though the channel were still live. (R-7.5-a, R-7.5-b)

Not part of the `Transport` contract — a test/simulation affordance.

#### Parameters

##### reason?

`string`

#### Returns

`void`
