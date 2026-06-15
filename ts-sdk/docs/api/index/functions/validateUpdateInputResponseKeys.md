[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / validateUpdateInputResponseKeys

# Function: validateUpdateInputResponseKeys()

> **validateUpdateInputResponseKeys**(`outstandingInputRequests`, `inputResponses`): `object`

Defined in: [protocol/tasks-lifecycle.ts:304](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tasks-lifecycle.ts#L304)

Validates the `tasks/update` key-binding rule: every key in `inputResponses`
MUST match a key currently outstanding in the task's `inputRequests` snapshot.
(§25.8, R-25.8-b, AC-40.13)

Delegates to S17's [validateInputResponseKeys](validateInputResponseKeys.md) so the key-matching logic
is shared with the in-line multi-round-trip flow. Returns the offending keys in
`unknownKeys` when any response key is not currently outstanding. Note this is a
client-side well-formedness check; a server SHOULD instead simply IGNORE stale
keys ([filterOutstandingInputResponses](filterOutstandingInputResponses.md), R-25.8-g).

## Parameters

### outstandingInputRequests

`Record`\<`string`, `unknown`\>

The task's currently-outstanding `inputRequests`
  (the snapshot from the latest `input_required` `tasks/get`).

### inputResponses

`Record`\<`string`, `unknown`\>

The client's `tasks/update` `inputResponses`.

## Returns

`object`

### valid

> **valid**: `boolean`

### unknownKeys

> **unknownKeys**: `string`[]
