[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / CAPABILITY\_OBLIGATIONS

# Variable: CAPABILITY\_OBLIGATIONS

> `const` **CAPABILITY\_OBLIGATIONS**: readonly [`CapabilityObligation`](../interfaces/CapabilityObligation.md)[]

Defined in: [protocol/conformance-requirements.ts:386](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/conformance-requirements.ts#L386)

The per-capability obligation map of §29.4: each advertised capability binds
its advertiser to a feature section's MUST-level behavior. (R-29.4-b – R-29.4-g)

  tools        → §16
  resources    → §17  (resources.subscribe additionally → §10)
  prompts      → §18
  completions  → §19
  elicitation  → §20  (client)
