[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / mayRateLimitPoll

# Function: mayRateLimitPoll()

> **mayRateLimitPoll**(`lastPolledAtMs`, `nowMs`, `pollIntervalMs`): `boolean`

Defined in: [protocol/tasks-lifecycle.ts:681](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tasks-lifecycle.ts#L681)

Returns `true` when a server MAY rate-limit a `tasks/get` poll that arrived
sooner than the most recently advertised `pollIntervalMs`. (§25.7, R-25.7-o,
AC-40.9)

A server is PERMITTED (not required) to rate-limit such a poll. This reports
eligibility: `true` when the gap since the last poll is below the advertised
minimum. A first poll (no prior poll) is never rate-limitable.

## Parameters

### lastPolledAtMs

`number` \| `undefined`

Epoch ms of the previous poll, or `undefined` for the
  first poll.

### nowMs

`number`

The current time in epoch ms.

### pollIntervalMs

`number` \| `undefined`

The most recently advertised `pollIntervalMs`, or
  `undefined` when none was advertised.

## Returns

`boolean`
