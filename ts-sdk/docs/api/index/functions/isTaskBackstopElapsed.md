[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isTaskBackstopElapsed

# Function: isTaskBackstopElapsed()

> **isTaskBackstopElapsed**(`createdAtMs`, `ttlMs`, `nowMs`, `status`): `boolean`

Defined in: [protocol/tasks-lifecycle.ts:742](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tasks-lifecycle.ts#L742)

Returns `true` when a client MAY treat a task as not usable because its non-null
`ttlMs` backstop has elapsed without the observable status advancing past a
non-terminal state. (§25.11, R-25.11-c, AC-40.41)

The client MAY consider the task not usable once `createdAt + ttlMs` has passed
and the task is still non-terminal. A `null` `ttlMs` (unbounded) is never a
backstop and returns `false`. Time inputs are epoch milliseconds.

## Parameters

### createdAtMs

`number`

The task's creation time in epoch ms.

### ttlMs

`number` \| `null`

The task's `ttlMs` (non-negative number, or `null`).

### nowMs

`number`

The current time in epoch ms.

### status

`"input_required"` \| `"cancelled"` \| `"completed"` \| `"working"` \| `"failed"`

The task's last observed `TaskStatus`.

## Returns

`boolean`
