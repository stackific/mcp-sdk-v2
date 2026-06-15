[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ResponseCache

# Class: ResponseCache\<T\>

Defined in: [protocol/caching.ts:231](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/caching.ts#L231)

Minimal in-memory response cache wired to `isFresh`, `resolveCacheScope`,
and the method→notification invalidation map. (§13, R-13.5-j)

- Freshness is computed via `isFresh(ttlMs, receivedAt, now)` — `ttlMs=0`
  entries are stored but never served fresh. (RC-3)
- `invalidateByNotification` evicts all entries (including paginated cursor
  pages) for every method mapped to the given notification. (RC-9)
- Scope is resolved conservatively via `resolveCacheScope`. (RC-5)

## Type Parameters

### T

`T` *extends* `Record`\<`string`, `unknown`\>

## Constructors

### Constructor

> **new ResponseCache**\<`T`\>(): `ResponseCache`\<`T`\>

#### Returns

`ResponseCache`\<`T`\>

## Accessors

### size

#### Get Signature

> **get** **size**(): `number`

Defined in: [protocol/caching.ts:283](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/caching.ts#L283)

Number of entries currently stored (may include `ttlMs=0` entries).

##### Returns

`number`

## Methods

### set()

> **set**(`key`, `value`, `receivedAt`): `void`

Defined in: [protocol/caching.ts:239](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/caching.ts#L239)

Stores `value` under `key`. Skipped when either caching hint is missing or
invalid (`hasBothOrNeitherCacheHints` + `isCacheHintValid`). A `ttlMs=0`
entry is stored but will never be returned as a cache hit. (R-13.1-g)

#### Parameters

##### key

`string`

##### value

`T`

##### receivedAt

`number`

#### Returns

`void`

***

### get()

> **get**(`key`, `now`): [`CacheGetResult`](../type-aliases/CacheGetResult.md)\<`T`\>

Defined in: [protocol/caching.ts:256](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/caching.ts#L256)

Returns the entry for `key` if it is still fresh at `now`; otherwise returns
`{ hit: false }` and evicts the stale entry. (R-13.2-e, RC-3, RC-5)

#### Parameters

##### key

`string`

##### now

`number`

#### Returns

[`CacheGetResult`](../type-aliases/CacheGetResult.md)\<`T`\>

***

### invalidateByNotification()

> **invalidateByNotification**(`notification`): `void`

Defined in: [protocol/caching.ts:270](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/caching.ts#L270)

Evicts all entries for every method that maps to `notification`, including
all paginated-cursor-page entries (keys prefixed with `method::`). (RC-9)

#### Parameters

##### notification

`string`

#### Returns

`void`
