[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / resolvePollIntervalMs

# Function: resolvePollIntervalMs()

> **resolvePollIntervalMs**(`pollIntervalMs`, `fallbackMs?`): `number`

Defined in: [protocol/tasks.ts:600](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tasks.ts#L600)

The interval, in ms, a client SHOULD wait before its next `tasks/get` poll.
(§25.4, R-25.4-d, R-25.4-e)

When the task's `pollIntervalMs` is a non-negative number, that value is the
recommended MINIMUM and is returned (the client SHOULD NOT poll faster). When
it is absent (`undefined`), the client chooses a reasonable interval, supplied
here as `fallbackMs`.

## Parameters

### pollIntervalMs

`number` \| `undefined`

The task's `pollIntervalMs`, or `undefined` when absent.

### fallbackMs?

`number` = `1000`

The client's chosen interval when none is recommended
  (default 1000 ms — a reasonable polling cadence).

## Returns

`number`
