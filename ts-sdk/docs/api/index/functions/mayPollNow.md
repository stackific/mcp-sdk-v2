[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / mayPollNow

# Function: mayPollNow()

> **mayPollNow**(`lastPolledAtMs`, `nowMs`, `pollIntervalMs`, `fallbackMs?`): `boolean`

Defined in: [protocol/tasks.ts:621](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tasks.ts#L621)

Returns `true` when polling at `nowMs`, given the last poll at `lastPolledAtMs`,
respects the recommended minimum interval. (§25.4, R-25.4-d, AC-39.12)

A client SHOULD wait at least `pollIntervalMs` (or its `fallbackMs` substitute)
between successive polls and SHOULD NOT poll more frequently. This returns
`false` when not enough time has elapsed.

## Parameters

### lastPolledAtMs

`number` \| `undefined`

Epoch ms of the previous poll, or `undefined` for the
  first poll (always allowed).

### nowMs

`number`

The current time in epoch ms.

### pollIntervalMs

`number` \| `undefined`

The task's `pollIntervalMs`, or `undefined` when absent.

### fallbackMs?

`number` = `1000`

The interval used when `pollIntervalMs` is absent.

## Returns

`boolean`
