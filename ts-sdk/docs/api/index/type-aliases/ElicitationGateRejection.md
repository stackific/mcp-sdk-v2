[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ElicitationGateRejection

# Type Alias: ElicitationGateRejection

> **ElicitationGateRejection** = \{ `reason`: `"capability-not-declared"`; \} \| \{ `reason`: `"mode-not-supported"`; `mode`: [`ElicitationMode`](ElicitationMode.md); \}

Defined in: [protocol/elicitation.ts:450](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/elicitation.ts#L450)

Why a server may not emit an `elicitation/create` request, per §20.1 gating.

## Union Members

### Type Literal

\{ `reason`: `"capability-not-declared"`; \}

The client did not declare the `elicitation` capability. (R-20.1-e)

***

### Type Literal

\{ `reason`: `"mode-not-supported"`; `mode`: [`ElicitationMode`](ElicitationMode.md); \}

The client declared `elicitation` but not the requested `mode`. (R-20.1-d)
