[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isLegalTaskTransition

# Function: isLegalTaskTransition()

> **isLegalTaskTransition**(`from`, `to`): `boolean`

Defined in: [protocol/tasks.ts:270](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tasks.ts#L270)

Returns `true` when a task MAY transition from `from` to `to`, per the §25.5
lifecycle rules. (R-25.5-b, R-25.5-c)

  - From a terminal state: no transition is ever legal — the state is immutable
    (R-25.5-b). (A "transition" to the SAME terminal state is likewise not a
    transition and is rejected; observing the same state is not a change.)
  - From `working`: MAY go to `input_required`, `completed`, `failed`, or
    `cancelled` (R-25.5-c).
  - From `input_required`: MAY go back to `working`, or to any terminal state
    (R-25.5-c).

A self-transition between identical NON-terminal states (`working → working`,
`input_required → input_required`) is not a state change and returns `false`.

## Parameters

### from

`"input_required"` \| `"cancelled"` \| `"completed"` \| `"working"` \| `"failed"`

The task's current status.

### to

`"input_required"` \| `"cancelled"` \| `"completed"` \| `"working"` \| `"failed"`

The proposed next status.

## Returns

`boolean`
