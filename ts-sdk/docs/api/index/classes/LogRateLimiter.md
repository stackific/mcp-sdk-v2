[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / LogRateLimiter

# Class: LogRateLimiter

Defined in: [protocol/logging.ts:164](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/logging.ts#L164)

Global rate-limiter for `notifications/message` log emissions. (RC-3 / SHOULD)

Implementations SHOULD throttle log notifications to avoid flooding the
transport. A sender may call `shouldEmit()` before dispatching each log
notification; the limiter suppresses emissions that arrive within the quiet
window.

Unlike `ProgressRateLimiter`, log notifications are NOT per-token — a single
shared throttle window applies to the entire notification stream, because all
log messages share the same `notifications/message` channel.

## Example

```ts
const limiter = new LogRateLimiter(50); // 50 ms minimum interval
if (limiter.shouldEmit(Date.now())) {
  sendLogNotification(level, data);
}
```

## Constructors

### Constructor

> **new LogRateLimiter**(`intervalMs?`): `LogRateLimiter`

Defined in: [protocol/logging.ts:172](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/logging.ts#L172)

#### Parameters

##### intervalMs?

`number` = `50`

Minimum milliseconds between successive log notifications.
  Defaults to 50 ms. (RC-3)

#### Returns

`LogRateLimiter`

## Methods

### shouldEmit()

> **shouldEmit**(`nowMs`): `boolean`

Defined in: [protocol/logging.ts:184](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/logging.ts#L184)

Returns `true` when a log notification may be emitted at `nowMs`.

Calling this method records `nowMs` as the last-emit time when emission is
permitted, so the next call is automatically constrained.

#### Parameters

##### nowMs

`number`

Current time in milliseconds (pass `Date.now()` at the call site).

#### Returns

`boolean`
