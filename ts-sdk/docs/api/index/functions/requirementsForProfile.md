[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / requirementsForProfile

# Function: requirementsForProfile()

> **requirementsForProfile**(`profile`): [`ConformanceRequirement`](../interfaces/ConformanceRequirement.md)[]

Defined in: [protocol/conformance-requirements.ts:932](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/conformance-requirements.ts#L932)

Enumerates every normative requirement that APPLIES to a profile: every
baseline requirement for the role(s) it plays, plus every transport
requirement (an implementation always implements at least one transport).
(§29.1, §29.9 item 1) The result is the exact obligation set a conformance
harness must verify for this implementation — no more, no less.

Feature-axis requirements that are unconditional (the baseline `§29.1`,
`§29.6`, `§29.7`, `§29.9` atoms) always apply; the capability-conditioned
`§29.4` atoms apply only when the relevant capability is advertised — callers
combine this with [obligedSectionsForCapabilities](obligedSectionsForCapabilities.md) for the feature-section
MUST-level behaviors owned by other stories.

## Parameters

### profile

[`ConformanceProfile`](../interfaces/ConformanceProfile.md)

## Returns

[`ConformanceRequirement`](../interfaces/ConformanceRequirement.md)[]
