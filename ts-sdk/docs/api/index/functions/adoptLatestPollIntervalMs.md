[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / adoptLatestPollIntervalMs

# Function: adoptLatestPollIntervalMs()

> **adoptLatestPollIntervalMs**(`latestObserved`, `previousObserved`, `fallbackMs?`): `number`

Defined in: [protocol/tasks-lifecycle.ts:658](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tasks-lifecycle.ts#L658)

Resolves the `pollIntervalMs` a client should honor between consecutive
`tasks/get` requests, ADOPTING THE LATEST observed value. Because
`pollIntervalMs` MAY change over the task's lifetime, a client SHOULD use the
value from the most recent `tasks/get` result. (§25.7, R-25.7-m, R-25.7-n,
AC-40.8)

When the latest observation carries no `pollIntervalMs`, the previously observed
value (if any) is retained; failing that, the client's `fallbackMs`. Delegates
the final fallback to S39's [resolvePollIntervalMs](resolvePollIntervalMs.md).

## Parameters

### latestObserved

`number` \| `undefined`

`pollIntervalMs` from the most recent `tasks/get`, or
  `undefined` when absent.

### previousObserved

`number` \| `undefined`

The previously adopted `pollIntervalMs`, or `undefined`.

### fallbackMs?

`number` = `1000`

The interval used when neither has supplied a value.

## Returns

`number`
