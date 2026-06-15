[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isFresh

# Function: isFresh()

> **isFresh**(`ttlMs`, `receivedAt`, `now`): `boolean`

Defined in: [protocol/caching.ts:142](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/caching.ts#L142)

Returns `true` when the result is still within its freshness window.
(R-13.2-e, R-13.2-f)

Formula: `(ttlMs > 0) AND (now < receivedAt + ttlMs)`.

A client MUST NOT assume the client and server clocks agree; the computation
uses only the client's local `receivedAt` and the `ttlMs` value. (R-13.2-g)

## Parameters

### ttlMs

`number`

Non-negative freshness hint from the result.

### receivedAt

`number`

The client's local timestamp (ms since epoch) when the
  response was received.

### now

`number`

The current client-local timestamp (ms since epoch).

## Returns

`boolean`
