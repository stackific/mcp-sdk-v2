[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / decideExtensionUse

# Function: decideExtensionUse()

> **decideExtensionUse**(`opts`): [`ExtensionFallbackDecision`](../type-aliases/ExtensionFallbackDecision.md)

Defined in: [protocol/extension-mechanism.ts:601](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/extension-mechanism.ts#L601)

Decides how a peer should handle an operation that could use `identifier`,
given the active set and whether the operation mandates the extension.
(R-24.7-a, R-24.7-b, R-24.7-d, R-24.7-f)

  - active                    → `'use-extension'`;
  - not active, not mandatory → `'fallback'` (use core behavior, R-24.7-a/b);
  - not active, mandatory     → `'reject'`   (surface an actionable error).

Thin wrapper over S11's [decideExtensionFallback](decideExtensionFallback.md) that derives `active`
from membership in `activeSet`, so callers reason in terms of the active set
rather than two raw maps.

## Parameters

### opts

#### identifier

`string`

#### activeSet

`Iterable`\<`string`\>

#### mandatory

`boolean`

## Returns

[`ExtensionFallbackDecision`](../type-aliases/ExtensionFallbackDecision.md)
