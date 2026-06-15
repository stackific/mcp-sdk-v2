[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / uiMayEmitBeforeInitResponse

# Function: uiMayEmitBeforeInitResponse()

> **uiMayEmitBeforeInitResponse**(`method`): `boolean`

Defined in: [protocol/ui-host.ts:711](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui-host.ts#L711)

Returns `true` when a conforming UI MAY emit a dialect message with `method`
BEFORE it has received the `ui/initialize` response. Only `ui/initialize`
itself qualifies; every other dialect message — including
`ui/notifications/initialized` — MUST wait for the response. (§26.5.1,
R-26.5.1-a; AC-42.3)

`ui/notifications/initialized` is sent only AFTER the response (it is the
third step of the handshake), so it returns `false` here.

## Parameters

### method

`string`

The method/notification name the UI intends to send.

## Returns

`boolean`
