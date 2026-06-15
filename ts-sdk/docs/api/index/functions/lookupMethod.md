[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / lookupMethod

# Function: lookupMethod()

> **lookupMethod**(`name`, `includeUiDialect?`): [`MethodNotificationIndexEntry`](../interfaces/MethodNotificationIndexEntry.md) \| `undefined`

Defined in: [protocol/registries.ts:219](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/registries.ts#L219)

Looks up the Appendix A entry for a method or notification `name`, searching
the core index first and (when `includeUiDialect` is `true`) the UI-dialect
names. Returns `undefined` when the name is not in the index. (Appendix A)

Because a handful of UI-dialect names (`tools/call`, `resources/read`,
`notifications/message`) shadow core names, the core index is preferred unless
a core hit is absent. To inspect a UI-dialect-only meaning, pass
`includeUiDialect: true` and read the returned `direction`/`definedIn`.

## Parameters

### name

`string`

### includeUiDialect?

`boolean` = `false`

## Returns

[`MethodNotificationIndexEntry`](../interfaces/MethodNotificationIndexEntry.md) \| `undefined`
