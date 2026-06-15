[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / applyNonFileDisposition

# Function: applyNonFileDisposition()

> **applyNonFileDisposition**(`uri`, `disposition`): `object`

Defined in: [protocol/roots.ts:401](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/roots.ts#L401)

Applies a receiver's chosen `disposition` to a candidate root `uri` that does
NOT use the `file` scheme, returning whether the root is kept. (R-21.1.5-c ·
MAY; AC-32.12)

- A `file://` `uri` is always kept (this rule only governs non-`file` URIs).
- A non-`file` `uri` is dropped (kept = `false`) under EITHER disposition;
  `'reject'` and `'ignore'` differ only in whether the receiver surfaces an
  error elsewhere — both remove the root from consideration here.

## Parameters

### uri

`unknown`

The candidate root URI.

### disposition

[`NonFileRootDisposition`](../type-aliases/NonFileRootDisposition.md)

`'reject'` or `'ignore'`.

## Returns

`object`

### kept

> **kept**: `boolean`

### disposition

> **disposition**: [`NonFileRootDisposition`](../type-aliases/NonFileRootDisposition.md)
