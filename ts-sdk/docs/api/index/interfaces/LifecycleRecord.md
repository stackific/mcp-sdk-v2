[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / LifecycleRecord

# Interface: LifecycleRecord

Defined in: [lifecycle/state.ts:33](https://github.com/stackific/mcp-sdk-node/blob/main/src/lifecycle/state.ts#L33)

Per-feature lifecycle bookkeeping (§27.1, §27.2).
This is a conceptual governance record, not a wire type.

## Properties

### feature

> **feature**: `string`

Defined in: [lifecycle/state.ts:35](https://github.com/stackific/mcp-sdk-node/blob/main/src/lifecycle/state.ts#L35)

Identifier of the governed feature (method, capability, type, etc.).

***

### state

> **state**: [`LifecycleState`](../type-aliases/LifecycleState.md)

Defined in: [lifecycle/state.ts:37](https://github.com/stackific/mcp-sdk-node/blob/main/src/lifecycle/state.ts#L37)

Current lifecycle state.

***

### deprecatedSince?

> `optional` **deprecatedSince?**: `string`

Defined in: [lifecycle/state.ts:39](https://github.com/stackific/mcp-sdk-node/blob/main/src/lifecycle/state.ts#L39)

ISO-8601 date when the feature first became Deprecated. Present only when Deprecated.

***

### earliestRemoval?

> `optional` **earliestRemoval?**: `string`

Defined in: [lifecycle/state.ts:41](https://github.com/stackific/mcp-sdk-node/blob/main/src/lifecycle/state.ts#L41)

Protocol revision on or after which the feature becomes eligible for removal. (R-27.2-c)

***

### migration?

> `optional` **migration?**: `string`

Defined in: [lifecycle/state.ts:43](https://github.com/stackific/mcp-sdk-node/blob/main/src/lifecycle/state.ts#L43)

Documented migration path, or `"none required"`. REQUIRED when Deprecated. (R-27.2-g)

***

### expedited?

> `optional` **expedited?**: `boolean`

Defined in: [lifecycle/state.ts:45](https://github.com/stackific/mcp-sdk-node/blob/main/src/lifecycle/state.ts#L45)

Whether a security-driven shortened window applies (minimum 90 days). (R-27.2-k, R-27.2-l)
