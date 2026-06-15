[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / decideExtensionFallback

# Function: decideExtensionFallback()

> **decideExtensionFallback**(`opts`): [`ExtensionFallbackDecision`](../type-aliases/ExtensionFallbackDecision.md)

Defined in: [protocol/extensions.ts:337](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/extensions.ts#L337)

Decides how to handle an operation given whether the extension is active
(advertised by both peers) and whether it is mandatory for the operation.
(R-6.5-l, R-6.5-n)

  - active                       → `'use-extension'`
  - not active, not mandatory    → `'fallback'` (use core protocol behavior)
  - not active, mandatory        → `'reject'`

A peer MUST NOT `'reject'` merely because the extension is one-sided; rejection
happens only when the extension is mandatory for the operation. (R-6.5-n)

## Parameters

### opts

#### active

`boolean`

#### mandatory

`boolean`

## Returns

[`ExtensionFallbackDecision`](../type-aliases/ExtensionFallbackDecision.md)
