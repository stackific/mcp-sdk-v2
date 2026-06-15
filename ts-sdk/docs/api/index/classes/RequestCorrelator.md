[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / RequestCorrelator

# Class: RequestCorrelator

Defined in: [transport/correlation.ts:60](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/correlation.ts#L60)

Correlates inbound responses to outstanding requests **by `id` only** — never
by delivery order, connection, stream, or position. (R-7.2-e – R-7.2-g, R-7.2-o)

Typical use by a sender:
```ts
const correlator = new RequestCorrelator();
const p1 = correlator.issue(1);   // does not block
const p2 = correlator.issue(2);   // multiplexed — no await between them
transport.onMessage((m) => { if (isResponse(m)) correlator.deliver(m); });
transport.onClose(() => correlator.failAll(new TransportError('disconnected')));
const r2 = await p2;              // resolves whenever id=2 arrives, even first
```

`"1"` (string) and `1` (number) are kept distinct because they are different
JSON types — matching S03's id rules (R-3.2-f, R-3.2-g).

## Constructors

### Constructor

> **new RequestCorrelator**(): `RequestCorrelator`

#### Returns

`RequestCorrelator`

## Accessors

### size

#### Get Signature

> **get** **size**(): `number`

Defined in: [transport/correlation.ts:165](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/correlation.ts#L165)

Number of currently outstanding requests.

##### Returns

`number`

***

### outstanding

#### Get Signature

> **get** **outstanding**(): readonly (`string` \| `number`)[]

Defined in: [transport/correlation.ts:170](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/correlation.ts#L170)

Snapshot of the currently outstanding ids.

##### Returns

readonly (`string` \| `number`)[]

## Methods

### issue()

> **issue**(`id`): `Promise`\<[`JSONRPCResponse`](../type-aliases/JSONRPCResponse.md)\>

Defined in: [transport/correlation.ts:80](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/correlation.ts#L80)

Registers `id` as outstanding and returns a promise that settles when a
matching response is delivered or the request is failed.

Concurrency: calling `issue` again before the first settles is allowed and
expected — the transport need not await one response before issuing another
(R-7.2-i, R-7.2-k, R-7.2-l).

#### Parameters

##### id

`string` \| `number`

#### Returns

`Promise`\<[`JSONRPCResponse`](../type-aliases/JSONRPCResponse.md)\>

#### Throws

Synchronously when `id` is already outstanding — a sender
  MUST NOT reuse the `id` of an unanswered request. (R-7.2-j)

***

### deliver()

> **deliver**(`response`): `boolean`

Defined in: [transport/correlation.ts:100](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/correlation.ts#L100)

Delivers an inbound response, resolving the matching outstanding request's
promise. Matching is purely by `id`; the order in which responses are
delivered is irrelevant (R-7.2-m, R-7.2-n, R-7.2-p).

A delivered error response (carrying `error`) still RESOLVES the promise —
it is a normal, fully delivered protocol message (§7.5). Only
[fail](#fail)/[failAll](#failall) reject (transport-level failure).

#### Parameters

##### response

[`JSONRPCResponse`](../type-aliases/JSONRPCResponse.md)

#### Returns

`boolean`

`true` if a matching outstanding request was found and resolved;
  `false` for an unknown/late `id` (e.g. a response to an already-failed
  request) — the correlator does not throw on an unmatched delivery.

***

### fail()

> **fail**(`id`, `error`): `boolean`

Defined in: [transport/correlation.ts:127](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/correlation.ts#L127)

Fails a single outstanding request with a transport-level error, rejecting
its promise so the caller can observe the failure rather than waiting
forever. (R-7.5-d, R-7.5-e)

#### Parameters

##### id

`string` \| `number`

##### error

[`TransportError`](TransportError.md)

#### Returns

`boolean`

`true` if the request was outstanding and is now failed.

***

### failAll()

> **failAll**(`error`): (`string` \| `number`)[]

Defined in: [transport/correlation.ts:148](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/correlation.ts#L148)

Fails **every** outstanding request — the action a transport takes on
abrupt or clean disconnection so no in-flight request can hang. (R-7.5-c,
R-7.5-d, R-7.5-e)

After this returns the correlator holds no outstanding requests, so the
same ids MAY be reissued against a fresh connection (R-7.5-f, R-7.7-b) —
no state is bound to the lost connection.

#### Parameters

##### error

[`TransportError`](TransportError.md)

#### Returns

(`string` \| `number`)[]

the ids that were failed.

***

### has()

> **has**(`id`): `boolean`

Defined in: [transport/correlation.ts:160](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/correlation.ts#L160)

`true` when `id` is currently outstanding.

#### Parameters

##### id

`string` \| `number`

#### Returns

`boolean`
