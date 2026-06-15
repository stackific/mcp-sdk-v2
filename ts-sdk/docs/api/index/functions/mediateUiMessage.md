[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / mediateUiMessage

# Function: mediateUiMessage()

> **mediateUiMessage**(`hostHonors`, `userConfirmed`): [`ToolsCallMediationDecision`](../type-aliases/ToolsCallMediationDecision.md)

Defined in: [protocol/ui-host.ts:978](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui-host.ts#L978)

Decides whether a host may honor a `ui/message` insertion. The host SHOULD
confirm with the user before inserting the message into the conversation.
(§26.7, R-26.7-l; AC-42.20) Same gate shape as [mediateOpenLink](mediateOpenLink.md).

## Parameters

### hostHonors

`boolean`

Whether the host chooses to honor the request.

### userConfirmed

`boolean`

Whether the user confirmed inserting the message.

## Returns

[`ToolsCallMediationDecision`](../type-aliases/ToolsCallMediationDecision.md)
