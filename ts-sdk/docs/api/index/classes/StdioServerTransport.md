[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / StdioServerTransport

# Class: StdioServerTransport

Defined in: [transport/stdio.ts:350](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/stdio.ts#L350)

The server side of a stdio connection: reads client requests/notifications
from `stdin` and writes responses/notifications to `stdout`. (§8 server role)

Enforces the server stream-role rule — it MUST NOT write a JSON-RPC request to
`stdout` and MUST NOT write non-MCP content there; diagnostics belong on
`stderr` (R-8.3-b, R-8.5-a, R-8.5-b). Graceful shutdown is observed when
`stdin` reaches EOF, at which point the server SHOULD exit promptly
(R-8.6.2-b); the server MAY also initiate shutdown by closing `stdout`
(R-8.6.2-c) via [close](#close).

## Extends

- `StdioEndpoint`

## Constructors

### Constructor

> **new StdioServerTransport**(`options?`): `StdioServerTransport`

Defined in: [transport/stdio.ts:351](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/stdio.ts#L351)

#### Parameters

##### options?

[`StdioServerTransportOptions`](../interfaces/StdioServerTransportOptions.md) = `{}`

#### Returns

`StdioServerTransport`

#### Overrides

`StdioEndpoint.constructor`

## Properties

### decoder

> `protected` **decoder**: [`FrameDecoder`](../interfaces/FrameDecoder.md)

Defined in: [transport/stdio.ts:153](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/stdio.ts#L153)

#### Inherited from

`StdioEndpoint.decoder`

***

### outbound

> `protected` **outbound**: `Writable` \| `null`

Defined in: [transport/stdio.ts:163](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/stdio.ts#L163)

#### Inherited from

`StdioEndpoint.outbound`

***

### inbound

> `protected` **inbound**: `Readable` \| `null`

Defined in: [transport/stdio.ts:164](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/stdio.ts#L164)

#### Inherited from

`StdioEndpoint.inbound`

## Accessors

### closed

#### Get Signature

> **get** **closed**(): `boolean`

Defined in: [transport/stdio.ts:280](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/stdio.ts#L280)

`true` once the channel has been closed or disconnected.

##### Returns

`boolean`

#### Inherited from

`StdioEndpoint.closed`

## Methods

### wireInbound()

> `protected` **wireInbound**(`source`): `void`

Defined in: [transport/stdio.ts:175](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/stdio.ts#L175)

Attaches the framing decoder to a byte source.

#### Parameters

##### source

`Readable` \| `null`

#### Returns

`void`

#### Inherited from

`StdioEndpoint.wireInbound`

***

### unwireInbound()

> `protected` **unwireInbound**(`source`): `void`

Defined in: [transport/stdio.ts:181](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/stdio.ts#L181)

Detaches the framing decoder from a byte source (used on restart).

#### Parameters

##### source

`Readable` \| `null`

#### Returns

`void`

#### Inherited from

`StdioEndpoint.unwireInbound`

***

### send()

> **send**(`message`): `void`

Defined in: [transport/stdio.ts:186](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/stdio.ts#L186)

Sends one message over the channel. MUST NOT silently drop it: on a closed
or failed channel this MUST surface an observable failure (e.g. throw or
reject with a `TransportError`) rather than discarding the message.
(R-7.2-q, R-7.2-s, R-7.5-i, R-7.5-j)

#### Parameters

##### message

[`JSONRPCMessage`](../type-aliases/JSONRPCMessage.md)

#### Returns

`void`

#### Inherited from

`StdioEndpoint.send`

***

### acceptBytes()

> `protected` **acceptBytes**(`chunk`): `void`

Defined in: [transport/stdio.ts:210](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/stdio.ts#L210)

Feeds received bytes into the framing decoder and dispatches each recovered
line. A malformed line is discarded as a transport-level error (surfaced via
`onError`) and reading continues at the next newline — the connection is
never torn down. (R-8.5-d, R-8.5-e, R-8.5-h)

#### Parameters

##### chunk

`Uint8Array`

#### Returns

`void`

#### Inherited from

`StdioEndpoint.acceptBytes`

***

### onMessage()

> **onMessage**(`handler`): [`Unsubscribe`](../type-aliases/Unsubscribe.md)

Defined in: [transport/stdio.ts:245](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/stdio.ts#L245)

Registers a handler for each inbound message. Returns an unsubscribe fn.

#### Parameters

##### handler

(`message`) => `void`

#### Returns

[`Unsubscribe`](../type-aliases/Unsubscribe.md)

#### Inherited from

`StdioEndpoint.onMessage`

***

### onError()

> **onError**(`handler`): [`Unsubscribe`](../type-aliases/Unsubscribe.md)

Defined in: [transport/stdio.ts:257](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/stdio.ts#L257)

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

#### Inherited from

`StdioEndpoint.onError`

***

### onClose()

> **onClose**(`handler`): [`Unsubscribe`](../type-aliases/Unsubscribe.md)

Defined in: [transport/stdio.ts:269](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/stdio.ts#L269)

Registers a handler invoked once when the channel becomes unusable — by a
clean close or an abrupt disconnection (R-7.2-t, R-7.5-a). Returns an
unsubscribe fn.

#### Parameters

##### handler

(`info`) => `void`

#### Returns

[`Unsubscribe`](../type-aliases/Unsubscribe.md)

#### Inherited from

`StdioEndpoint.onClose`

***

### markClosed()

> `protected` **markClosed**(`info`): `void`

Defined in: [transport/stdio.ts:285](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/stdio.ts#L285)

Marks the endpoint closed and notifies `onClose` subscribers exactly once.

#### Parameters

##### info

[`TransportCloseInfo`](../interfaces/TransportCloseInfo.md)

#### Returns

`void`

#### Inherited from

`StdioEndpoint.markClosed`

***

### close()

> **close**(`reason?`): `void`

Defined in: [transport/stdio.ts:365](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/stdio.ts#L365)

Server-initiated shutdown: closes `stdout` to the client and marks the
endpoint closed, after which the host process exits. (R-8.6.2-c)

#### Parameters

##### reason?

`string`

#### Returns

`void`

#### Overrides

`StdioEndpoint.close`
