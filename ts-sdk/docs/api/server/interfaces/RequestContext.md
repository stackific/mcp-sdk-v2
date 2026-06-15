[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [server](../README.md) / RequestContext

# Interface: RequestContext

Defined in: server/server.ts:48

Per-request context the transport hands the dispatcher (one per request, stateless).

## Properties

### protocolVersion

> **protocolVersion**: `string`

Defined in: server/server.ts:50

The negotiated protocol revision for this exchange.

***

### requestId

> **requestId**: `string` \| `number`

Defined in: server/server.ts:52

The JSON-RPC id of the originating request.

***

### meta

> **meta**: `Record`\<`string`, `unknown`\>

Defined in: server/server.ts:54

The request's `params._meta` (carries `progressToken`, trace context, …).

***

### signal

> **signal**: `AbortSignal`

Defined in: server/server.ts:56

Aborts when the client cancels this request (`notifications/cancelled`).

***

### authInfo?

> `optional` **authInfo?**: `unknown`

Defined in: server/server.ts:58

Transport-resolved caller identity (e.g. a validated bearer token), if any.

## Methods

### notify()

> **notify**(`notification`): `void`

Defined in: server/server.ts:60

Emits a notification on this request's stream.

#### Parameters

##### notification

###### method

`string`

###### params?

`Record`\<`string`, `unknown`\>

#### Returns

`void`

***

### serverRequest()

> **serverRequest**(`method`, `params`): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: server/server.ts:62

Issues a server→client request on this stream; resolves with the client's result.

#### Parameters

##### method

`string`

##### params

`Record`\<`string`, `unknown`\>

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

***

### notifySubscribers()?

> `optional` **notifySubscribers**(`notification`): `void`

Defined in: server/server.ts:68

Broadcasts a change notification to active subscription streams, filtered by
each subscription's honored set (§10.5/§10.6). Optional — present only on
transports that support subscriptions (Streamable HTTP).

#### Parameters

##### notification

###### method

`string`

###### params?

`Record`\<`string`, `unknown`\>

#### Returns

`void`
