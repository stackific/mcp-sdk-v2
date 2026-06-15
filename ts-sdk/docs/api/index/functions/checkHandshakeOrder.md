[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / checkHandshakeOrder

# Function: checkHandshakeOrder()

> **checkHandshakeOrder**(`phase`, `method`): [`HandshakeOrderViolation`](../type-aliases/HandshakeOrderViolation.md)

Defined in: [protocol/ui-host.ts:729](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui-host.ts#L729)

Conformance check for the handshake-ordering rule (R-26.5.1-a; AC-42.3): given
the channel `phase` and the `method` the UI is attempting to send, returns
`{ ok: true }` when the message is allowed, or a `premature-message` violation
when the UI emits anything other than `ui/initialize` before the init response.

## Parameters

### phase

[`UiChannelPhase`](../type-aliases/UiChannelPhase.md)

The current channel phase from the UI's perspective.

### method

`string`

The method/notification name the UI is attempting to send.

## Returns

[`HandshakeOrderViolation`](../type-aliases/HandshakeOrderViolation.md)
