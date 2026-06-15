[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / METHOD\_REGISTRY

# Variable: METHOD\_REGISTRY

> `const` **METHOD\_REGISTRY**: readonly [`MethodNotificationIndexEntry`](../interfaces/MethodNotificationIndexEntry.md)[]

Defined in: [protocol/registries.ts:139](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/registries.ts#L139)

Appendix A — the Method and Notification Index: every JSON-RPC method and
notification defined by the document and its extensions, with its kind,
direction, and defining section. (Appendix A)

The three input-request kinds (`elicitation/create`, `sampling/createMessage`,
`roots/list`) are delivered embedded in an input-required result and are NOT
standalone server-initiated requests (see [RegistryMethodKind](RegistryMethodKind.md)).

The trailing `UI↔host` rows are the additional user-interface-dialect names
(§26) that are in scope only when the UI extension is active; they carry
`extensionScoped: true`.
