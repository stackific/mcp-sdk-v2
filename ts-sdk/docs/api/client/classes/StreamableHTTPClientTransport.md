[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [client](../README.md) / StreamableHTTPClientTransport

# Class: StreamableHTTPClientTransport

Defined in: client/streamable-http.ts:87

The abstract transport contract every defined or custom transport satisfies.
(§7.1, §7.2)

A `Transport` is a bidirectional channel that carries the `JSONRPCMessage`
union as complete UTF-8 JSON values, preserves integrity, delivers in both
directions, never silently drops a message, and defines an observable clean
close and an observable abrupt disconnection.

A transport does NOT interpret method/params/result or perform capability or
version negotiation; those are core-protocol concerns carried unchanged.

## Implements

- [`Transport`](../../index/interfaces/Transport.md)

## Constructors

### Constructor

> **new StreamableHTTPClientTransport**(`url`, `options?`): `StreamableHTTPClientTransport`

Defined in: client/streamable-http.ts:102

#### Parameters

##### url

`string` \| `URL`

##### options?

[`StreamableHTTPClientTransportOptions`](../interfaces/StreamableHTTPClientTransportOptions.md) = `{}`

#### Returns

`StreamableHTTPClientTransport`

## Properties

### protocolVersion

> **protocolVersion**: `string`

Defined in: client/streamable-http.ts:89

Header protocol revision for bodies without their own `_meta` version.

## Accessors

### closed

#### Get Signature

> **get** **closed**(): `boolean`

Defined in: client/streamable-http.ts:115

`true` once the channel has been closed or disconnected.

##### Returns

`boolean`

`true` once the channel has been closed or disconnected.

#### Implementation of

[`Transport`](../../index/interfaces/Transport.md).[`closed`](../../index/interfaces/Transport.md#closed)

## Methods

### onMessage()

> **onMessage**(`handler`): [`Unsubscribe`](../../index/type-aliases/Unsubscribe.md)

Defined in: client/streamable-http.ts:119

Registers a handler for each inbound message. Returns an unsubscribe fn.

#### Parameters

##### handler

(`message`) => `void`

#### Returns

[`Unsubscribe`](../../index/type-aliases/Unsubscribe.md)

#### Implementation of

[`Transport`](../../index/interfaces/Transport.md).[`onMessage`](../../index/interfaces/Transport.md#onmessage)

***

### onError()

> **onError**(`handler`): [`Unsubscribe`](../../index/type-aliases/Unsubscribe.md)

Defined in: client/streamable-http.ts:126

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

[`Unsubscribe`](../../index/type-aliases/Unsubscribe.md)

#### Implementation of

[`Transport`](../../index/interfaces/Transport.md).[`onError`](../../index/interfaces/Transport.md#onerror)

***

### onClose()

> **onClose**(`handler`): [`Unsubscribe`](../../index/type-aliases/Unsubscribe.md)

Defined in: client/streamable-http.ts:133

Registers a handler invoked once when the channel becomes unusable — by a
clean close or an abrupt disconnection (R-7.2-t, R-7.5-a). Returns an
unsubscribe fn.

#### Parameters

##### handler

(`info`) => `void`

#### Returns

[`Unsubscribe`](../../index/type-aliases/Unsubscribe.md)

#### Implementation of

[`Transport`](../../index/interfaces/Transport.md).[`onClose`](../../index/interfaces/Transport.md#onclose)

***

### close()

> **close**(`reason?`): `Promise`\<`void`\>

Defined in: client/streamable-http.ts:140

Initiates an orderly (clean) close that each side can observe. (R-7.2-t)

#### Parameters

##### reason?

`string`

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`Transport`](../../index/interfaces/Transport.md).[`close`](../../index/interfaces/Transport.md#close)

***

### send()

> **send**(`message`): `Promise`\<`void`\>

Defined in: client/streamable-http.ts:160

POSTs one message. For a request the response (single JSON or SSE) is read
and every frame surfaced via `onMessage`; for a notification or a response we
require a 2xx and read nothing. (R-7.2-q: never silently drop — failures are
thrown to the caller or delivered as a synthetic error response for the id.)

#### Parameters

##### message

[`JSONRPCMessage`](../../index/type-aliases/JSONRPCMessage.md)

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`Transport`](../../index/interfaces/Transport.md).[`send`](../../index/interfaces/Transport.md#send)
