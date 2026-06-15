[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isUiExtensionActive

# Function: isUiExtensionActive()

> **isUiExtensionActive**(`clientExtensions`, `serverExtensions`): `boolean`

Defined in: [protocol/ui.ts:354](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui.ts#L354)

Returns `true` when, for an interaction, the apps extension is ACTIVE between
client and server — both validly advertise [UI\_EXTENSION\_ID](../variables/UI_EXTENSION_ID.md) in their
`extensions` maps. (§26.2, R-26.2-a; reuses S38 [isExtensionActive](isExtensionActive.md).)

Mere presence of the key on one side does not activate the extension; the
receiver computes the intersection. When inactive, the host treats a tool
carrying `_meta.ui` as a normal tool and ignores the UI key. (R-26.2-i)

## Parameters

### clientExtensions

`unknown`

The client/host's advertised `extensions` map (raw).

### serverExtensions

`unknown`

The server's advertised `extensions` map (raw).

## Returns

`boolean`
