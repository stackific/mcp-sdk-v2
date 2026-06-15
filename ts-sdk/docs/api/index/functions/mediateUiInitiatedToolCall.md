[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / mediateUiInitiatedToolCall

# Function: mediateUiInitiatedToolCall()

> **mediateUiInitiatedToolCall**(`input`): [`ToolsCallMediationDecision`](../type-aliases/ToolsCallMediationDecision.md)

Defined in: [protocol/security.ts:1189](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L1189)

Mediates a UI-requested `tools/call`, routing it through the host's normal
consent / human-in-the-loop path; the UI can never cause a tool to run without
host mediation and user consent. (§28.8, R-28.8-b, R-28.8-c, R-28.8-d; AC-44.21)

A thin restatement under the §28.8 atoms of S42's [mediateUiToolsCall](mediateUiToolsCall.md) — the
same gate that enforces visibility, host policy, and user consent before a
UI-originated call reaches a server. A `route: false` decision MUST be answered
with a §22 error, never a silent execution.

## Parameters

### input

[`ToolsCallMediationInput`](../interfaces/ToolsCallMediationInput.md)

The UI tool-call mediation input (S42).

## Returns

[`ToolsCallMediationDecision`](../type-aliases/ToolsCallMediationDecision.md)
