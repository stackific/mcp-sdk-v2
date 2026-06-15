[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / addCalendarMonths

# Function: addCalendarMonths()

> **addCalendarMonths**(`date`, `months`): `Date`

Defined in: [lifecycle/policy.ts:51](https://github.com/stackific/mcp-sdk-node/blob/main/src/lifecycle/policy.ts#L51)

Adds `months` calendar months to `date` using UTC arithmetic to avoid
local-timezone distortion. Day is clamped to the last valid day of the
target month when the original day overflows (e.g. Jan 31 + 1 → Feb 28).

## Parameters

### date

`Date`

### months

`number`

## Returns

`Date`
