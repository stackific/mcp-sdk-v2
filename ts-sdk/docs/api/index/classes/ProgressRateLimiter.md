[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ProgressRateLimiter

# Class: ProgressRateLimiter

Defined in: [protocol/progress.ts:232](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/progress.ts#L232)

Per-token rate-limiter for `notifications/progress` emissions. (RC-3 / SHOULD)

Implementations SHOULD throttle progress notifications to avoid flooding the
transport. A sender may call `shouldEmit()` before dispatching each notification;
the limiter suppresses emissions that arrive within the quiet window for that
token.

Each token has an independent time-of-last-emission so that a slow-moving
token is not penalized by a fast-moving one.

## Example

```ts
const limiter = new ProgressRateLimiter(100); // 100 ms minimum interval
if (limiter.shouldEmit(token, Date.now())) {
  sendProgressNotification(token, progress);
}
```

## Constructors

### Constructor

> **new ProgressRateLimiter**(`intervalMs?`): `ProgressRateLimiter`

Defined in: [protocol/progress.ts:240](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/progress.ts#L240)

#### Parameters

##### intervalMs?

`number` = `100`

Minimum milliseconds between successive progress
  notifications for the same token. Defaults to 100 ms. (RC-3)

#### Returns

`ProgressRateLimiter`

## Methods

### shouldEmit()

> **shouldEmit**(`token`, `nowMs`): `boolean`

Defined in: [protocol/progress.ts:253](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/progress.ts#L253)

Returns `true` when a notification for `token` may be emitted at `nowMs`.

Calling this method records `nowMs` as the last-emit time for the token
when emission is permitted, so the next call is automatically constrained.

#### Parameters

##### token

`string` \| `number`

The progress token being checked.

##### nowMs

`number`

Current time in milliseconds (pass `Date.now()` at the call site).

#### Returns

`boolean`

***

### complete()

> **complete**(`token`): `void`

Defined in: [protocol/progress.ts:265](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/progress.ts#L265)

Clears the rate-limit state for `token` when the operation is terminal.
Safe to call for an unknown token.

#### Parameters

##### token

`string` \| `number`

#### Returns

`void`
