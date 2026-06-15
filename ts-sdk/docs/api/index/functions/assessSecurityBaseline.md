[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / assessSecurityBaseline

# Function: assessSecurityBaseline()

> **assessSecurityBaseline**(`claims`): [`SecurityBaselineAssessment`](../type-aliases/SecurityBaselineAssessment.md)

Defined in: [protocol/security.ts:295](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L295)

Asserts that an implementation is designed around all four §28.1 core
principles. (§28.1, R-28-a, R-28.1-a; AC-44.1)

Returns `{ ok: true }` only when every principle is claimed; otherwise lists the
unmet ones, so a conformance review can fail an implementation that does not
demonstrably address the baseline. The principles are the foundation from which
the rest of §28 derives, so an unmet principle is a baseline failure, not a
warning.

## Parameters

### claims

[`SecurityBaselineClaims`](../interfaces/SecurityBaselineClaims.md)

The host's per-principle self-assertion.

## Returns

[`SecurityBaselineAssessment`](../type-aliases/SecurityBaselineAssessment.md)
