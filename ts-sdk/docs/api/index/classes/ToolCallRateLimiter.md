[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ToolCallRateLimiter

# Class: ToolCallRateLimiter

Defined in: [protocol/security.ts:541](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L541)

A sliding-window rate limiter a server applies to `tools/call` so a hostile or
malfunctioning client cannot drive unbounded execution or downstream load.
(§28.3, R-28.3-g, R-28.3-h; AC-44.9)

[check](#check) returns whether a call is within the limit; a server MUST reject
(not execute) any call that exceeds it (R-28.3-h) — use
[buildRateLimitRejection](../functions/buildRateLimitRejection.md) to build the `-32600` error. The window is
keyed by an opaque caller-chosen client/session id so per-peer limits are
independent. Time is injectable for testing.

## Constructors

### Constructor

> **new ToolCallRateLimiter**(`options`): `ToolCallRateLimiter`

Defined in: [protocol/security.ts:554](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L554)

#### Parameters

##### options

###### maxInWindow

`number`

The maximum permitted `tools/call` invocations per
  window per key; MUST be a positive integer. (R-28.3-g)

###### windowMs

`number`

The sliding-window length in milliseconds.

###### now?

() => `number`

OPTIONAL clock (epoch ms); defaults to `Date.now`.

#### Returns

`ToolCallRateLimiter`

#### Throws

When `maxInWindow`/`windowMs` are not positive.

## Methods

### check()

> **check**(`key`): \{ `allowed`: `true`; \} \| \{ `allowed`: `false`; `retryAfterMs`: `number`; \}

Defined in: [protocol/security.ts:582](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L582)

Records and evaluates one `tools/call` for `key`. Returns
`{ allowed: true }` when the call is within the limit, or
`{ allowed: false, retryAfterMs }` when it exceeds it and MUST be rejected
rather than executed (R-28.3-h). A rejected call is NOT counted toward the
window, so a flood cannot extend the back-off indefinitely.

#### Parameters

##### key

`string`

An opaque client/session identifier.

#### Returns

\{ `allowed`: `true`; \} \| \{ `allowed`: `false`; `retryAfterMs`: `number`; \}
