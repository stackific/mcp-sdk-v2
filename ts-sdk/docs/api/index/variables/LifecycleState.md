[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / LifecycleState

# Variable: LifecycleState

> **LifecycleState**: `object`

Defined in: [lifecycle/state.ts:13](https://github.com/stackific/mcp-sdk-node/blob/main/src/lifecycle/state.ts#L13)

## Type Declaration

### Active

> `readonly` **Active**: `"active"` = `'active'`

Fully supported and recommended; implemented exactly as specified. (R-27.1-a)

### Deprecated

> `readonly` **Deprecated**: `"deprecated"` = `'deprecated'`

Still defined and functional; discouraged for new use; scheduled for
eventual removal; carries a migration note. (R-27.1-b)

### Removed

> `readonly` **Removed**: `"removed"` = `'removed'`

Not defined by the document; carries no meaning; imposes no obligation.
A Removed feature is simply absent from the spec text and registries.
