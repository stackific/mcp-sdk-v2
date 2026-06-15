[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ProtocolSupportCache

# Class: ProtocolSupportCache

Defined in: [protocol/negotiation.ts:309](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/negotiation.ts#L309)

Caches the protocol-support determination per server endpoint. (R-5.7-e)

The determination is a property of the server endpoint, not of an individual
request, so a client SHOULD cache it for the lifetime of the connected server
process. A client MAY persist it across restarts of the same server
configuration (use [entries](#entries) / [fromEntries](#fromentries)) and re-probe — via
[invalidate](#invalidate) — if a cached assumption later proves wrong. (R-5.7-f)

Endpoints are identified by an opaque caller-chosen key (e.g. a stdio command
line or an HTTP endpoint URL).

## Constructors

### Constructor

> **new ProtocolSupportCache**(): `ProtocolSupportCache`

#### Returns

`ProtocolSupportCache`

## Methods

### fromEntries()

> `static` **fromEntries**(`entries`): `ProtocolSupportCache`

Defined in: [protocol/negotiation.ts:338](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/negotiation.ts#L338)

Rebuilds a cache from persisted [entries](#fromentries). (R-5.7-f)

#### Parameters

##### entries

`Iterable`\<\[`string`, [`ProtocolSupportDetermination`](../type-aliases/ProtocolSupportDetermination.md)\]\>

#### Returns

`ProtocolSupportCache`

***

### set()

> **set**(`endpoint`, `determination`): `void`

Defined in: [protocol/negotiation.ts:313](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/negotiation.ts#L313)

Records a determination for `endpoint`.

#### Parameters

##### endpoint

`string`

##### determination

[`ProtocolSupportDetermination`](../type-aliases/ProtocolSupportDetermination.md)

#### Returns

`void`

***

### get()

> **get**(`endpoint`): [`ProtocolSupportDetermination`](../type-aliases/ProtocolSupportDetermination.md) \| `undefined`

Defined in: [protocol/negotiation.ts:318](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/negotiation.ts#L318)

Returns the cached determination for `endpoint`, or `undefined`.

#### Parameters

##### endpoint

`string`

#### Returns

[`ProtocolSupportDetermination`](../type-aliases/ProtocolSupportDetermination.md) \| `undefined`

***

### has()

> **has**(`endpoint`): `boolean`

Defined in: [protocol/negotiation.ts:323](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/negotiation.ts#L323)

Returns `true` when a determination is cached for `endpoint`.

#### Parameters

##### endpoint

`string`

#### Returns

`boolean`

***

### invalidate()

> **invalidate**(`endpoint`): `void`

Defined in: [protocol/negotiation.ts:328](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/negotiation.ts#L328)

Drops the cached determination so the client re-probes. (R-5.7-f)

#### Parameters

##### endpoint

`string`

#### Returns

`void`

***

### entries()

> **entries**(): \[`string`, [`ProtocolSupportDetermination`](../type-aliases/ProtocolSupportDetermination.md)\][]

Defined in: [protocol/negotiation.ts:333](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/negotiation.ts#L333)

Snapshot of all cached determinations, for persistence. (R-5.7-f)

#### Returns

\[`string`, [`ProtocolSupportDetermination`](../type-aliases/ProtocolSupportDetermination.md)\][]
