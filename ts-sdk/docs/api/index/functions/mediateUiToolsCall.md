[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / mediateUiToolsCall

# Function: mediateUiToolsCall()

> **mediateUiToolsCall**(`input`): [`ToolsCallMediationDecision`](../type-aliases/ToolsCallMediationDecision.md)

Defined in: [protocol/ui-host.ts:929](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui-host.ts#L929)

Decides whether a host may route a UI-initiated `tools/call` to the server.
(§26.5.3, §26.7, R-26.5.3-a, R-26.5.3-b, R-26.7-i, R-26.7-j, R-26.7-k; AC-42.5,
AC-42.6)

The host routes the call ONLY when ALL hold, in this precedence:
  1. the tool's effective `visibility` includes `"app"` (SHOULD reject
     otherwise — reuses S41 [hostShouldRejectUiOriginatedCall](hostShouldRejectUiOriginatedCall.md)); a
     rejection here is a `policy` decline;
  2. the host's tool-execution policy permits the call (`policy` decline);
  3. the user has consented (`no-consent` decline).

A path that reaches the server WITHOUT prior consent and policy is a failure
(AC-42.5): this function returns `route: false` in every such case, and the
caller MUST answer with the corresponding §22 error (never a silent drop).

## Parameters

### input

[`ToolsCallMediationInput`](../interfaces/ToolsCallMediationInput.md)

## Returns

[`ToolsCallMediationDecision`](../type-aliases/ToolsCallMediationDecision.md)
