[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ConsentDecision

# Type Alias: ConsentDecision

> **ConsentDecision** = \{ `allowed`: `true`; `reason`: `"matches-prior-grant"` \| `"freshly-approved"`; \} \| \{ `allowed`: `false`; `reason`: `"no-consent"` \| `"not-informed"` \| `"material-change"` \| `"silent-escalation"`; `detail`: `string`; \}

Defined in: [protocol/security.ts:342](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L342)

The §28.2 consent-gate decision.
