[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / FeatureStatus

# Type Alias: FeatureStatus

> **FeatureStatus** = *typeof* [`FeatureStatus`](../variables/FeatureStatus.md)\[keyof *typeof* [`FeatureStatus`](../variables/FeatureStatus.md)\]

Defined in: [protocol/conformance.ts:7](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/conformance.ts#L7)

Feature lifecycle status (§27, R-1.3-b, R-2.2-f – R-2.2-h).

A feature with status `deprecated` remains defined and MUST still be accepted
by receivers, but SHOULD NOT be relied upon by new implementations.
