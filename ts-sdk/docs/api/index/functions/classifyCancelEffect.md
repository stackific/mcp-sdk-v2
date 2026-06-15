[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / classifyCancelEffect

# Function: classifyCancelEffect()

> **classifyCancelEffect**(`currentStatus`): `"acknowledged-terminal"` \| `"acknowledged-pending"`

Defined in: [protocol/tasks-lifecycle.ts:473](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tasks-lifecycle.ts#L473)

Decides what a server's stored task does when it receives `tasks/cancel`.
Cancellation is cooperative: the server is obligated only to acknowledge, never
to force a transition. A task already in a TERMINAL status MUST NOT change as a
result of `tasks/cancel` — terminal status is final. (§25.9, R-25.9-h, R-25.9-i,
R-25.9-j, AC-40.28, AC-40.29)

  - `"acknowledged-terminal"` — the task is already terminal; the server
    acknowledges but MUST NOT change its status (no-op on state). (R-25.9-j)
  - `"acknowledged-pending"`  — the task is non-terminal; the server
    acknowledges and MAY (but need not) move it toward `cancelled` when feasible.
    The eventual terminal status MAY be something other than `cancelled` if the
    work finished first. (R-25.9-h, R-25.9-i)

Either way the wire response is the same empty acknowledgement
([buildTaskAcknowledgementResult](buildTaskAcknowledgementResult.md)); this only reports the state effect.

## Parameters

### currentStatus

`"input_required"` \| `"cancelled"` \| `"completed"` \| `"working"` \| `"failed"`

The task's current `TaskStatus`.

## Returns

`"acknowledged-terminal"` \| `"acknowledged-pending"`
