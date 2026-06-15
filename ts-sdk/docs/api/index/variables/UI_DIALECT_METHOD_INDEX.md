[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / UI\_DIALECT\_METHOD\_INDEX

# Variable: UI\_DIALECT\_METHOD\_INDEX

> `const` **UI\_DIALECT\_METHOD\_INDEX**: readonly [`MethodNotificationIndexEntry`](../interfaces/MethodNotificationIndexEntry.md)[]

Defined in: [protocol/registries.ts:183](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/registries.ts#L183)

The additional UI-dialect message names (§26) exchanged on the UI message
channel (`UI↔host`), in scope ONLY when the user-interface extension is
active — beyond the two handshake names already in [METHOD\_REGISTRY](METHOD_REGISTRY.md).
Named `..._INDEX` to stay distinct from `UI_DIALECT_METHODS` (the method-name
constant map owned by `./ui-host.js`, S41).
Recorded separately because they are conditional on the extension. (Appendix A)
