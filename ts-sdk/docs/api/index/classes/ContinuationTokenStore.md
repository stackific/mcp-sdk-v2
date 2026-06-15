[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ContinuationTokenStore

# Class: ContinuationTokenStore\<S\>

Defined in: [protocol/security.ts:970](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L970)

A server-side store for `requestState` continuation tokens that protects their
integrity and confidentiality and guards against replay, the §28.6 handling
profile. (§28.6, R-28.6-a, R-28.6-b, R-28.6-c; AC-44.18)

The client only ever sees the opaque `value`; the state and integrity tag are
held entirely server-side (the "unguessable handle" design §28.6 permits). On
presentation [validate](#validate) rejects — rather than acting on — a token that
fails integrity (R-28.6-b), is expired, was already consumed (single-use replay
defense), or is unknown. [issue](#issue) mints a single-use, optionally
time-bounded handle.

## Type Parameters

### S

`S` = `unknown`

## Constructors

### Constructor

> **new ContinuationTokenStore**\<`S`\>(`options?`): `ContinuationTokenStore`\<`S`\>

Defined in: [protocol/security.ts:981](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L981)

#### Parameters

##### options?

###### now?

() => `number`

OPTIONAL clock (epoch ms); defaults to `Date.now`.

###### mint?

() => `string`

OPTIONAL unguessable-value generator; defaults to a
  monotonic random-ish handle. Inject a CSPRNG-backed generator in production.

#### Returns

`ContinuationTokenStore`\<`S`\>

## Methods

### issue()

> **issue**(`state`, `options?`): [`ContinuationTokenRecord`](../interfaces/ContinuationTokenRecord.md)\<`S`\>

Defined in: [protocol/security.ts:999](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L999)

Mints a single-use continuation token for `state`, with an optional integrity
tag and time bound. The returned `value` is the opaque handle to give the
client; the state never crosses the wire. (R-28.6-a, R-28.6-c)

#### Parameters

##### state

`S`

The server-side continuation state to stash.

##### options?

###### integrityTag?

`string`

OPTIONAL signature/MAC the client must echo for a
  signed-token design; defaults to the handle being its own integrity (unguessable
  handle). (R-28.6-a)

###### ttlMs?

`number`

OPTIONAL time bound; the token expires after this many ms. (R-28.6-c)

#### Returns

[`ContinuationTokenRecord`](../interfaces/ContinuationTokenRecord.md)\<`S`\>

***

### validate()

> **validate**(`value`, `presentedIntegrityTag?`): [`ContinuationTokenValidation`](../type-aliases/ContinuationTokenValidation.md)\<`S`\>

Defined in: [protocol/security.ts:1022](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L1022)

Validates a presented continuation token, returning the protected state on
success or a structured rejection. A receiver MUST reject (never act on) a token
that fails integrity (R-28.6-b); replay (expiry or re-use) is refused too
(R-28.6-c). A successful validation consumes the single-use token.

#### Parameters

##### value

`string`

The opaque token value the client presented.

##### presentedIntegrityTag?

`string`

The integrity tag the client echoed, for a signed
  design; omit for an unguessable-handle design.

#### Returns

[`ContinuationTokenValidation`](../type-aliases/ContinuationTokenValidation.md)\<`S`\>
