[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / mediateOpenLink

# Function: mediateOpenLink()

> **mediateOpenLink**(`hostHonors`, `userConfirmed`): [`ToolsCallMediationDecision`](../type-aliases/ToolsCallMediationDecision.md)

Defined in: [protocol/ui-host.ts:957](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui-host.ts#L957)

Decides whether a host may honor a `ui/open-link` request. The host MAY decline
and SHOULD confirm with the user before honoring it; a non-confirming auto-open
is a conformance failure. (§26.5.3, §26.7, R-26.5.3-d, R-26.7-l; AC-42.8)

Returns `route: true` only when the host both chose to honor the request AND
obtained the user's confirmation; otherwise a `policy` (host declined) or
`no-consent` (no confirmation) decline.

## Parameters

### hostHonors

`boolean`

Whether the host chooses to honor the request (MAY decline).

### userConfirmed

`boolean`

Whether the user confirmed opening the link (SHOULD confirm).

## Returns

[`ToolsCallMediationDecision`](../type-aliases/ToolsCallMediationDecision.md)
