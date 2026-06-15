[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / reconcileExtensionSettings

# Function: reconcileExtensionSettings()

> **reconcileExtensionSettings**(`clientExtensions`, `serverExtensions`, `identifier`): \{ `client`: [`ExtensionSettings`](../type-aliases/ExtensionSettings.md); `server`: [`ExtensionSettings`](../type-aliases/ExtensionSettings.md); \} \| `undefined`

Defined in: [protocol/extension-mechanism.ts:835](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/extension-mechanism.ts#L835)

Reconciles the settings a peer advertised for `identifier` on each side,
producing the inputs an extension needs to apply its own reconciliation rules.
(R-24.3-g) Returns `undefined` when the extension is not advertised by BOTH
peers (it is not active, so there is nothing to reconcile).

Each side's settings are returned as-is (S11 already dropped `null`/malformed
entries); the extension itself decides how to combine them (e.g. intersect MIME
types, pick the lower version). This helper only guarantees both sides'
settings are present and the extension is active.

## Parameters

### clientExtensions

`unknown`

The client's advertised `extensions` map (raw).

### serverExtensions

`unknown`

The server's advertised `extensions` map (raw).

### identifier

`string`

The extension whose settings to reconcile.

## Returns

\{ `client`: [`ExtensionSettings`](../type-aliases/ExtensionSettings.md); `server`: [`ExtensionSettings`](../type-aliases/ExtensionSettings.md); \} \| `undefined`
