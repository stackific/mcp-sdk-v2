[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isTaskExpired

# Function: isTaskExpired()

> **isTaskExpired**(`createdAtMs`, `ttlMs`, `nowMs`): `boolean`

Defined in: [protocol/tasks.ts:576](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tasks.ts#L576)

Returns `true` when a task with a non-null `ttlMs` has expired by `nowMs` —
the lifetime has elapsed since `createdAtMs`, so a server MAY discard it.
(§25.4, §25.6, R-25.4-c, R-25.6-f)

A `null` `ttlMs` means an unbounded lifetime: such a task never expires by
`ttlMs` and this returns `false`. The actual discard is at the server's
discretion (MAY); this predicate only reports eligibility for discard.

## Parameters

### createdAtMs

`number`

The task's creation time in epoch milliseconds.

### ttlMs

`number` \| `null`

The task's `ttlMs` (non-negative number, or `null`).

### nowMs

`number`

The current time in epoch milliseconds.

## Returns

`boolean`
