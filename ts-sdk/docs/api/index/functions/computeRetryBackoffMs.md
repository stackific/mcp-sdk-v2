[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / computeRetryBackoffMs

# Function: computeRetryBackoffMs()

> **computeRetryBackoffMs**(`attempt`, `opts?`): `number`

Defined in: [protocol/multi-round-trip.ts:789](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/multi-round-trip.ts#L789)

Computes an exponential-backoff delay (ms) for the Nth retry on repeated
non-progress — a client retrying without progress SHOULD apply a reasonable
backoff (and SHOULD offer the user a way to cancel). (§11.5 line 2518, R-11.5-n)

## Parameters

### attempt

`number`

The 1-based retry attempt number (attempt ≤ 0 ⇒ 0 ms).

### opts?

`baseMs` (default 250) and `maxMs` (default 30000) bounds.

#### baseMs?

`number`

#### maxMs?

`number`

## Returns

`number`
