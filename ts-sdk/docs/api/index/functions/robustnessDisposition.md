[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / robustnessDisposition

# Function: robustnessDisposition()

> **robustnessDisposition**(`element`, `recognized`): [`RobustnessDisposition`](../type-aliases/RobustnessDisposition.md)

Defined in: [protocol/conformance-requirements.ts:685](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/conformance-requirements.ts#L685)

Computes the §29.6 robustness disposition for one received element, given
whether the receiver recognizes it. (§29.6, R-29.6-a – R-29.6-h)

  - an unknown `field`/`capability`/`extension` → `ignore` (never reject);
  - an unknown `result-type` → `treat-as-error` (must not act on it);
  - an unknown `error-code`  → `fail-request` (surface as a failure);
  - any recognized element     → `accept`.

This NEVER discards understood content: robustness applies only to the
unrecognized (R-29.6-i) — a recognized element always returns `accept`. The
absence of a resultType is handled by [interpretResultType](interpretResultType.md) (the §3
absence rule, R-29.6-h), not here.

## Parameters

### element

[`RobustnessElement`](../type-aliases/RobustnessElement.md)

### recognized

`boolean`

## Returns

[`RobustnessDisposition`](../type-aliases/RobustnessDisposition.md)
