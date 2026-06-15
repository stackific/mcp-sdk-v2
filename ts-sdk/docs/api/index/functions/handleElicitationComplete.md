[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / handleElicitationComplete

# Function: handleElicitationComplete()

> **handleElicitationComplete**(`notification`, `known`): [`ElicitationCompleteHandling`](../type-aliases/ElicitationCompleteHandling.md)

Defined in: [protocol/elicitation-form.ts:1107](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/elicitation-form.ts#L1107)

Decides how a client should react to an incoming elicitation-complete
notification, enforcing the §20.6 ignore rule. (§20.6, R-20.6-d, R-20.6-e)

A client MUST ignore a notification whose `elicitationId` is unknown or already
completed (R-20.6-d); for a still-pending id it MAY proceed to auto-retry,
update its UI, or otherwise continue (R-20.6-e). Independently of the
notification, a client SHOULD provide manual retry/cancel controls in case it
never arrives (R-20.6-f) — a UI concern outside this pure decision.

## Parameters

### notification

`unknown`

The received notification (validated here).

### known

`Record`\<`string`, [`ElicitationLifecycleState`](../type-aliases/ElicitationLifecycleState.md)\>

Map of `elicitationId` → tracked lifecycle state for the
  in-flight URL-mode elicitations this client initiated.

## Returns

[`ElicitationCompleteHandling`](../type-aliases/ElicitationCompleteHandling.md)
