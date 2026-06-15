[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / UiChannelPhase

# Type Alias: UiChannelPhase

> **UiChannelPhase** = `"awaiting-init-response"` \| `"initialized"`

Defined in: [protocol/ui-host.ts:697](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui-host.ts#L697)

The phases of the dialect channel's lifecycle, from the UI's perspective.

  - `awaiting-init-response` — the UI has sent (or is about to send)
    `ui/initialize` and is waiting for the host's response;
  - `initialized` — the response has arrived; the UI may now send
    `ui/notifications/initialized` and any subsequent dialect message.

The UI MUST NOT issue any other dialect message before the `ui/initialize`
response arrives (R-26.5.1-a). [uiMayEmitBeforeInitResponse](../functions/uiMayEmitBeforeInitResponse.md) encodes
which messages a conforming UI may emit in the first phase.
