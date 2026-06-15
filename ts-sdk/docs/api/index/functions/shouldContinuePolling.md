[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / shouldContinuePolling

# Function: shouldContinuePolling()

> **shouldContinuePolling**(`status`, `cancelRequested?`): `boolean`

Defined in: [protocol/tasks-lifecycle.ts:702](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tasks-lifecycle.ts#L702)

Returns `true` when a client SHOULD continue polling a task: it is non-terminal
AND the client has not issued `tasks/cancel`. A client SHOULD poll until the
task reaches a terminal status or it cancels. (§25.7, §25.8, R-25.7-p, R-25.8-n,
AC-40.10, AC-40.22)

After `tasks/cancel`, the client MAY stop polling immediately and need not wait
for `cancelled` (R-25.9-k, AC-40.30) — pass `cancelRequested: true`.

## Parameters

### status

`"input_required"` \| `"cancelled"` \| `"completed"` \| `"working"` \| `"failed"`

The task's last observed `TaskStatus`.

### cancelRequested?

`boolean` = `false`

Whether the client has already issued `tasks/cancel`.

## Returns

`boolean`
