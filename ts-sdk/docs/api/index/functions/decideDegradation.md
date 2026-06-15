[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / decideDegradation

# Function: decideDegradation()

> **decideDegradation**(`opts`): [`DegradationDecision`](../type-aliases/DegradationDecision.md)

Defined in: [protocol/capability-negotiation.ts:417](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/capability-negotiation.ts#L417)

Decides how to handle an operation when the other peer may not declare the
optional behavior it would use. (R-6.4-l, R-6.4-m)

  - peer declares the behavior        → `'proceed'` (use the optional behavior)
  - peer does not, behavior optional  → `'fallback'` (use mutually supported core)
  - peer does not, behavior mandatory → `'reject'`

A peer MUST NOT return `'reject'` merely because the other declared fewer
capabilities — rejection happens only when the missing behavior is mandatory
for the operation. (R-6.4-m)

## Parameters

### opts

#### peerDeclaresBehavior

`boolean`

#### behaviorMandatory

`boolean`

## Returns

[`DegradationDecision`](../type-aliases/DegradationDecision.md)
