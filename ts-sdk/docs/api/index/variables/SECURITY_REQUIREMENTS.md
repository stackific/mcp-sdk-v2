[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / SECURITY\_REQUIREMENTS

# Variable: SECURITY\_REQUIREMENTS

> `const` **SECURITY\_REQUIREMENTS**: readonly [`SecurityRequirement`](../interfaces/SecurityRequirement.md)[]

Defined in: [protocol/security.ts:120](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L120)

Every numbered §28 requirement atom, in spec order — the single enumerable
security baseline an implementation must address. (R-28-a, and every R-28.x-y)

This is the data behind [assessSecurityBaseline](../functions/assessSecurityBaseline.md) and the conformance
lookups; each entry carries the atom id used throughout the per-feature modules
so a reviewer can trace an obligation to the code that enforces it (e.g.
`R-28.5-b` → S37 `validateTokenAudience`). The protocol cannot enforce these at
the wire level (R-28-a), so the registry is the checklist conformance depends
on.
