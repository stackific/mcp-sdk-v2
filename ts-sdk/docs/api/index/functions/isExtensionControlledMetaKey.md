[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isExtensionControlledMetaKey

# Function: isExtensionControlledMetaKey()

> **isExtensionControlledMetaKey**(`metaKey`, `identifier`): `boolean`

Defined in: [protocol/extension-mechanism.ts:311](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/extension-mechanism.ts#L311)

Returns `true` when `metaKey` is a reserved `_meta` key that the extension
identified by `identifier` is entitled to define — i.e. the key carries a
valid prefix that the extension controls, per the §4 prefix rules. (R-24.5-d)

"Controls" means the key's prefix labels are the same dot-separated labels as
the extension identifier's vendor prefix (the part before the identifier's
`/`). For `io.modelcontextprotocol/ui` the controlled keys are those under
`io.modelcontextprotocol/…`; for `com.example/x`, under `com.example/…`.

A core-protocol extension legitimately controls a reserved prefix (its second
label is `modelcontextprotocol`/`mcp`); a third-party extension's own prefix is
non-reserved. Either way the key is valid for THAT extension iff the labels
match.

## Parameters

### metaKey

`string`

### identifier

`string`

## Returns

`boolean`
