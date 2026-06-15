[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ROOTS\_LIST\_CHANGED\_NOTIFICATION\_METHOD

# Variable: ROOTS\_LIST\_CHANGED\_NOTIFICATION\_METHOD

> `const` **ROOTS\_LIST\_CHANGED\_NOTIFICATION\_METHOD**: `"notifications/roots/list_changed"`

Defined in: [protocol/roots.ts:183](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/roots.ts#L183)

The `notifications/roots/list_changed` notification method name.

⚠️ DEPRECATED / UNSUPPORTED in this revision. No `listChanged` sub-flag is
defined for the `roots` capability, so this notification is NOT gated by any
sub-flag and a client MUST NOT rely on it to convey root-set changes.
(R-21.1.2-c · MUST NOT; AC-32.5) The name is exposed only so a receiver can
recognize and ignore it; [mayRelyOnRootsListChanged](../functions/mayRelyOnRootsListChanged.md) returns `false`.
