[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / serverAcknowledgesUi

# Function: serverAcknowledgesUi()

> **serverAcknowledgesUi**(`serverExtensionsMap`): `boolean`

Defined in: [protocol/ui.ts:406](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui.ts#L406)

Returns `true` when a server's `server/discover` result `capabilities.extensions`
map acknowledges the apps extension — the [UI\_EXTENSION\_ID](../variables/UI_EXTENSION_ID.md) key is
present with a (possibly empty) object value. (§26.2, R-26.2-j; reuses S11
[isExtensionAdvertised](isExtensionAdvertised.md).)

## Parameters

### serverExtensionsMap

`unknown`

The `capabilities.extensions` map from a
  `DiscoverResult` (raw).

## Returns

`boolean`
