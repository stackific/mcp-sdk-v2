[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isEligibleForRemoval

# Function: isEligibleForRemoval()

> **isEligibleForRemoval**(`deprecatedSince`, `now`, `expedited?`): `boolean`

Defined in: [lifecycle/policy.ts:74](https://github.com/stackific/mcp-sdk-node/blob/main/src/lifecycle/policy.ts#L74)

Returns `true` when a Deprecated feature is eligible for removal, meaning
the minimum window has elapsed. (R-27.2-c, R-27.2-l, AC-43.7, AC-43.16)

Eligibility is a necessary condition for removal, not a mandate — a feature
MAY remain Deprecated indefinitely. (R-27.2-d, AC-43.8)

## Parameters

### deprecatedSince

`Date`

The date the feature first became Deprecated.

### now

`Date`

The date to test against (usually the current date).

### expedited?

`boolean` = `false`

When `true`, applies the 90-day minimum instead of 12 months.

## Returns

`boolean`
