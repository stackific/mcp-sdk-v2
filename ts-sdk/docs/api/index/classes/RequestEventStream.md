[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / RequestEventStream

# Class: RequestEventStream

Defined in: [transport/http/responses.ts:234](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/responses.ts#L234)

A request-scoped event stream that enforces the §9.6.2 lifecycle: only
request-scoped notifications before the final response, the final response
terminates the stream, and no message is sent after termination — whether the
terminator is the final response or a client-initiated close (cancellation).
(R-9.6.2-c, R-9.6.2-d, R-9.6.2-e, R-9.6.2-f, R-9.6.2-i, R-9.6.2-k)

It is a thin, transport-agnostic state machine: `sink` receives each formatted
SSE event string; how that string reaches the wire is the caller's concern.

## Constructors

### Constructor

> **new RequestEventStream**(`sink`): `RequestEventStream`

Defined in: [transport/http/responses.ts:244](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/responses.ts#L244)

#### Parameters

##### sink

(`event`) => `void`

Receives each formatted SSE event string to deliver on the wire.

#### Returns

`RequestEventStream`

## Accessors

### closed

#### Get Signature

> **get** **closed**(): `boolean`

Defined in: [transport/http/responses.ts:249](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/responses.ts#L249)

Whether the stream is closed (terminated).

##### Returns

`boolean`

***

### completed

#### Get Signature

> **get** **completed**(): `boolean`

Defined in: [transport/http/responses.ts:254](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/responses.ts#L254)

Whether the stream closed by delivering its final response.

##### Returns

`boolean`

## Methods

### sendNotification()

> **sendNotification**(`notification`): `void`

Defined in: [transport/http/responses.ts:263](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/responses.ts#L263)

Emits a request-scoped notification before the final response. (R-9.6.2-b,
R-9.6.2-c) Throws if the message is not stream-legal (e.g. a request) or if
the stream is already closed (R-9.6.2-f/k forbid further messages).

#### Parameters

##### notification

`object` & `Record`\<`string`, `unknown`\>

#### Returns

`void`

***

### sendFinalResponse()

> **sendFinalResponse**(`response`): `void`

Defined in: [transport/http/responses.ts:280](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/responses.ts#L280)

Sends the final JSON-RPC response and terminates the stream. (R-9.6.2-e)
After this, the server MUST NOT send further messages for the request
(R-9.6.2-f); subsequent `sendNotification`/`sendFinalResponse` calls throw.

#### Parameters

##### response

`object` & `Record`\<`string`, `unknown`\>

#### Returns

`void`

***

### cancelByClientClose()

> **cancelByClientClose**(): `void`

Defined in: [transport/http/responses.ts:292](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/responses.ts#L292)

Records that the client closed the stream before the final response. The
server MUST treat this as cancellation of the request and MUST NOT send any
further messages for it. (R-9.6.2-i, R-9.6.2-k) Idempotent.

#### Returns

`void`
