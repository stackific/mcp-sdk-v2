[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isReservedMetaKey

# Function: isReservedMetaKey()

> **isReservedMetaKey**(`key`): `boolean`

Defined in: [protocol/registries.ts:372](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/registries.ts#L372)

Returns `true` when `key` is reserved by this document and so MAY appear in
`_meta` without being treated as an unknown/custom key: any key under the
reserved `io.modelcontextprotocol/`/`mcp` prefix, or one of the four
bare-by-exception keys (`progressToken`, `traceparent`, `tracestate`,
`baggage`). (R-AppC-a, AC-46.3)

Reuses [RESERVED\_BARE\_KEYS](../variables/RESERVED_BARE_KEYS.md) (S05) and [isReservedMetaKeyPrefix](isReservedMetaKeyPrefix.md)
(S02) so the reservation surface stays single-sourced. Extension-defined keys
outside the reserved prefix are NOT reserved by this predicate — they are
nonetheless permitted in `_meta` by the §24/§4 namespacing rules; use
[isMetaKeyPermitted](isMetaKeyPermitted.md) to confirm a key MAY appear at all. (R-AppC-j)

## Parameters

### key

`string`

## Returns

`boolean`
