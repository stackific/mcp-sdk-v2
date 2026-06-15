[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / SamplingConsentObligations

# Interface: SamplingConsentObligations

Defined in: [protocol/sampling.ts:844](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/sampling.ts#L844)

The consent & safety obligations a conforming client/host MUST or SHOULD honor
around sampling. (§21.2.10) Surfaced as a structured checklist so a host can
assert it satisfies each obligation and so conformance reviews can enumerate
them. The booleans report which obligations a host claims to meet.

## Properties

### humanInTheLoop

> **humanInTheLoop**: `boolean`

Defined in: [protocol/sampling.ts:846](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/sampling.ts#L846)

MUST keep a human in the loop. (R-21.2.10-a)

***

### userMayDeny

> **userMayDeny**: `boolean`

Defined in: [protocol/sampling.ts:848](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/sampling.ts#L848)

MUST let the user deny a sampling request. (R-21.2.10-b)

***

### reviewPromptBeforeSampling

> **reviewPromptBeforeSampling**: `boolean`

Defined in: [protocol/sampling.ts:850](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/sampling.ts#L850)

SHOULD present the prompt for review/edit/reject before sampling. (R-21.2.10-c)

***

### reviewResultBeforeServer

> **reviewResultBeforeServer**: `boolean`

Defined in: [protocol/sampling.ts:852](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/sampling.ts#L852)

SHOULD present the result for review/edit/reject before the server sees it. (R-21.2.10-d)

***

### mayModifyControlFields

> **mayModifyControlFields**: `boolean`

Defined in: [protocol/sampling.ts:854](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/sampling.ts#L854)

MAY modify/omit systemPrompt/includeContext/temperature/stopSequences/metadata. (R-21.2.10-e)

***

### rateLimiting

> **rateLimiting**: `boolean`

Defined in: [protocol/sampling.ts:856](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/sampling.ts#L856)

SHOULD implement rate limiting. (R-21.2.10-f)

***

### validateContent

> **validateContent**: `boolean`

Defined in: [protocol/sampling.ts:858](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/sampling.ts#L858)

SHOULD validate message content (both parties). (R-21.2.10-g)

***

### handleSensitiveData

> **handleSensitiveData**: `boolean`

Defined in: [protocol/sampling.ts:860](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/sampling.ts#L860)

MUST handle sensitive data appropriately (both parties). (R-21.2.10-h)

***

### toolLoopIterationLimits

> **toolLoopIterationLimits**: `boolean`

Defined in: [protocol/sampling.ts:862](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/sampling.ts#L862)

SHOULD implement iteration limits for tool loops when tools are used. (R-21.2.10-i)
