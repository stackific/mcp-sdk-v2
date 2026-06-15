[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / StdioClientTransport

# Class: StdioClientTransport

Defined in: [transport/stdio.ts:419](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/stdio.ts#L419)

The client side of a stdio connection: launches/holds a server subprocess,
writes requests/notifications to its `stdin`, and reads responses/notifications
from its `stdout`. (§8 client role)

Responsibilities beyond framing:
  - Stream-role enforcement: only requests/notifications, and only valid MCP
    messages, may go to `stdin` (R-8.3-a, R-8.5-c).
  - `stderr` handling: captured/forwarded/ignored, never parsed as protocol,
    never assumed to mean an error (R-8.4-c, R-8.4-d, R-8.4-e, R-8.1-a).
  - Graceful shutdown: close `stdin` (EOF), await exit, force-terminate on
    timeout (R-8.6.2-a, R-8.6.3-a).
  - Unexpected-exit restart (SHOULD) and lost in-flight retry (MAY)
    (R-8.6.4-a, R-8.6.4-b).
  - The §5.7 probe via [probeProtocol](#probeprotocol) (R-8.7-d – R-8.7-h).

## Extends

- `StdioEndpoint`

## Constructors

### Constructor

> **new StdioClientTransport**(`options`): `StdioClientTransport`

Defined in: [transport/stdio.ts:439](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/stdio.ts#L439)

#### Parameters

##### options

[`StdioClientTransportOptions`](../interfaces/StdioClientTransportOptions.md)

#### Returns

`StdioClientTransport`

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

***

### correlator

> `readonly` **correlator**: [`RequestCorrelator`](RequestCorrelator.md)

Defined in: [transport/stdio.ts:427](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/stdio.ts#L427)

Sender-side correlator; reused across a restart so ids may be retried.

***

### supportCache

> `readonly` **supportCache**: [`ProtocolSupportCache`](ProtocolSupportCache.md)

Defined in: [transport/stdio.ts:429](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/stdio.ts#L429)

Per-endpoint protocol-support cache for the §5.7 probe. (R-5.7-e)

***

### probeMethod

> `readonly` `static` **probeMethod**: `"server/discover"` = `SERVER_DISCOVER_METHOD`

Defined in: [transport/stdio.ts:511](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/stdio.ts#L511)

The method a `server/discover` probe carries (for building the probe request).

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

***

### capturedStderr

#### Get Signature

> **get** **capturedStderr**(): `Buffer`

Defined in: [transport/stdio.ts:465](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/stdio.ts#L465)

A copy of the captured `stderr` bytes (the client MAY forward/ignore). (R-8.4-c)

##### Returns

`Buffer`

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

### onRestart()

> **onRestart**(`handler`): [`Unsubscribe`](../type-aliases/Unsubscribe.md)

Defined in: [transport/stdio.ts:470](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/stdio.ts#L470)

Registers a handler invoked with the fresh child after a restart.

#### Parameters

##### handler

(`child`) => `void`

#### Returns

[`Unsubscribe`](../type-aliases/Unsubscribe.md)

***

### probeProtocol()

> **probeProtocol**(`endpointKey`, `response`): [`ProbeOutcome`](../type-aliases/ProbeOutcome.md)

Defined in: [transport/stdio.ts:495](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/stdio.ts#L495)

Sends a `server/discover` probe and classifies the outcome per §5.7, caching
the per-endpoint determination. (R-8.7-d, R-8.7-h)

Probing before any other request is RECOMMENDED even for a single-revision
client because it yields a deterministic capability answer. The three
outcomes are interpreted by the reused [interpretProbeResponse](../functions/interpretProbeResponse.md):
  - `supported` / `unsupported-version` → the server speaks this family; the
    client selects a revision from the advertised set and continues, and MUST
    NOT fall back to a session-establishing handshake on the `-32004` outcome
    (R-8.7-e).
  - `not-this-protocol` (other error / no response) → a client with a
    handshake-based counterpart MAY fall back to its handshake; that fallback
    MUST NOT be keyed to one specific error code (R-8.7-f, R-8.7-g).

#### Parameters

##### endpointKey

`string`

Opaque per-endpoint key for the support cache.

##### response

`unknown`

The probe response, or `null`/`undefined` for a timeout.

#### Returns

[`ProbeOutcome`](../type-aliases/ProbeOutcome.md)

***

### deliverResponse()

> **deliverResponse**(`response`): `boolean`

Defined in: [transport/stdio.ts:518](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/stdio.ts#L518)

Delivers an inbound response to the correlator and returns whether it matched
an outstanding request — a convenience for callers wiring `onMessage` to the
reused [RequestCorrelator](RequestCorrelator.md).

#### Parameters

##### response

[`JSONRPCResponse`](../type-aliases/JSONRPCResponse.md)

#### Returns

`boolean`

***

### close()

> **close**(`reason?`): `Promise`\<`void`\>

Defined in: [transport/stdio.ts:530](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/stdio.ts#L530)

Graceful shutdown (R-8.6.2-a): (1) close the child's `stdin` (EOF — the only
portable graceful signal), (2) wait for the process to exit, (3) forcibly
terminate it if it does not exit within `shutdownGraceMs` (R-8.6.3-a).

Resolves once the process has exited (or been force-terminated). The close
is observable via `onClose` with `clean: true`.

#### Parameters

##### reason?

`string`

#### Returns

`Promise`\<`void`\>

#### Overrides

`StdioEndpoint.close`
