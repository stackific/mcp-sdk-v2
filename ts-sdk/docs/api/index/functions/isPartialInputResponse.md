[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isPartialInputResponse

# Function: isPartialInputResponse()

> **isPartialInputResponse**(`outstandingInputRequests`, `inputResponses`): `boolean`

Defined in: [protocol/tasks-lifecycle.ts:358](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tasks-lifecycle.ts#L358)

Returns `true` when `inputResponses` answers only a STRICT SUBSET of the task's
currently-outstanding `inputRequests` — i.e. at least one outstanding key is not
answered. A server MAY accept such a partial set; the task then remains
`input_required` until the remaining responses arrive. (§25.8, R-25.8-h,
AC-40.17)

Only currently-outstanding answered keys count toward "answered" (stale keys are
ignored per [filterOutstandingInputResponses](filterOutstandingInputResponses.md)). When there are no
outstanding requests, this returns `false` (nothing to partially answer).

## Parameters

### outstandingInputRequests

`Record`\<`string`, `unknown`\>

The task's currently-outstanding `inputRequests`.

### inputResponses

`Record`\<`string`, `unknown`\>

The client's `tasks/update` `inputResponses`.

## Returns

`boolean`
