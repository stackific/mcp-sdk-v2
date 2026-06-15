[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / InFlightTracker

# Class: InFlightTracker

Defined in: [jsonrpc/framing.ts:293](https://github.com/stackific/mcp-sdk-node/blob/main/src/jsonrpc/framing.ts#L293)

Tracks in-flight request identifiers for a single sender on a single
connection, enforcing the uniqueness rules in §3.2.

Per R-3.2-c a sender MUST NOT reuse an identifier while the original
request is still awaiting a response. Per R-3.2-d all outstanding ids
from a single sender on a single connection MUST be unique.

String and number ids with the same textual representation are kept
distinct because they are different JSON types (R-3.2-f, R-3.2-g):
`"1"` and `1` are different ids.

## Constructors

### Constructor

> **new InFlightTracker**(): `InFlightTracker`

#### Returns

`InFlightTracker`

## Accessors

### size

#### Get Signature

> **get** **size**(): `number`

Defined in: [jsonrpc/framing.ts:329](https://github.com/stackific/mcp-sdk-node/blob/main/src/jsonrpc/framing.ts#L329)

The number of currently in-flight requests.

##### Returns

`number`

***

### outstanding

#### Get Signature

> **get** **outstanding**(): readonly (`string` \| `number`)[]

Defined in: [jsonrpc/framing.ts:334](https://github.com/stackific/mcp-sdk-node/blob/main/src/jsonrpc/framing.ts#L334)

All currently outstanding identifiers (snapshot).

##### Returns

readonly (`string` \| `number`)[]

## Methods

### register()

> **register**(`id`): `void`

Defined in: [jsonrpc/framing.ts:305](https://github.com/stackific/mcp-sdk-node/blob/main/src/jsonrpc/framing.ts#L305)

Registers `id` as in-flight for an outgoing request.

#### Parameters

##### id

`string` \| `number`

#### Returns

`void`

#### Throws

When `id` is already in-flight, indicating a reuse violation.

***

### complete()

> **complete**(`id`): `void`

Defined in: [jsonrpc/framing.ts:319](https://github.com/stackific/mcp-sdk-node/blob/main/src/jsonrpc/framing.ts#L319)

Removes `id` from the in-flight set once a response has been received.
It is safe to call this for an id that is not currently tracked.

#### Parameters

##### id

`string` \| `number`

#### Returns

`void`

***

### has()

> **has**(`id`): `boolean`

Defined in: [jsonrpc/framing.ts:324](https://github.com/stackific/mcp-sdk-node/blob/main/src/jsonrpc/framing.ts#L324)

Returns `true` when `id` is currently registered as in-flight.

#### Parameters

##### id

`string` \| `number`

#### Returns

`boolean`
