[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / canTransition

# Function: canTransition()

> **canTransition**(`from`, `to`): `boolean`

Defined in: [lifecycle/policy.ts:26](https://github.com/stackific/mcp-sdk-node/blob/main/src/lifecycle/policy.ts#L26)

Returns `true` when the transition from `from` to `to` is permitted.

Permitted:  Active → Deprecated, Deprecated → Active, Deprecated → Removed.
Forbidden:  Active → Removed (R-27.2-b), any transition out of Removed.

## Parameters

### from

[`LifecycleState`](../type-aliases/LifecycleState.md)

### to

[`LifecycleState`](../type-aliases/LifecycleState.md)

## Returns

`boolean`
