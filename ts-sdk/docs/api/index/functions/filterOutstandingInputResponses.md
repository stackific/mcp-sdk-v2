[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / filterOutstandingInputResponses

# Function: filterOutstandingInputResponses()

> **filterOutstandingInputResponses**(`outstandingInputRequests`, `inputResponses`): `object`

Defined in: [protocol/tasks-lifecycle.ts:327](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tasks-lifecycle.ts#L327)

The server-side handling of `tasks/update` `inputResponses`: keep only the
entries whose key is CURRENTLY OUTSTANDING for the task, dropping any entry
whose key was never issued, already answered, or superseded. (§25.8, R-25.8-g,
AC-40.16)

A server SHOULD ignore stale entries rather than error, and MAY accept a strict
subset of the outstanding keys (the task then remains `input_required` until the
remaining responses arrive — see [isPartialInputResponse](isPartialInputResponse.md)). (R-25.8-h,
AC-40.17)

## Parameters

### outstandingInputRequests

`Record`\<`string`, `unknown`\>

The task's currently-outstanding `inputRequests`.

### inputResponses

`Record`\<`string`, `unknown`\>

The client's `tasks/update` `inputResponses`.

## Returns

`object`

The subset of `inputResponses` the server acts on, plus the keys it
  ignored.

### accepted

> **accepted**: `Record`\<`string`, `unknown`\>

### ignoredKeys

> **ignoredKeys**: `string`[]
