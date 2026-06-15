[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / assertLegalTaskTransition

# Function: assertLegalTaskTransition()

> **assertLegalTaskTransition**(`from`, `to`): `void`

Defined in: [protocol/tasks.ts:295](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tasks.ts#L295)

Asserts that a proposed status transition is legal, throwing when it is not.
(R-25.5-b, R-25.5-c)

Useful for server-side state machines that mutate a stored task: it refuses
any transition out of a terminal state (the immutability guarantee) and any
illegal non-terminal move.

## Parameters

### from

`"input_required"` \| `"cancelled"` \| `"completed"` \| `"working"` \| `"failed"`

### to

`"input_required"` \| `"cancelled"` \| `"completed"` \| `"working"` \| `"failed"`

## Returns

`void`

## Throws

when `from → to` is not a legal transition.
