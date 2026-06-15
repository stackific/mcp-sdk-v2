[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isConformantNonFileDisposition

# Function: isConformantNonFileDisposition()

> **isConformantNonFileDisposition**(`disposition`): `disposition is NonFileRootDisposition`

Defined in: [protocol/roots.ts:382](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/roots.ts#L382)

Returns `true` when `disposition` is a CONFORMANT way to handle a root whose
`uri` does not use the `file` scheme: a receiver MAY either `'reject'` it or
`'ignore'` it. (R-21.1.5-c · MAY; AC-32.12)

Both dispositions are conformant; this predicate exists so a receiver can
assert its chosen policy is one the spec permits.

## Parameters

### disposition

`string`

## Returns

`disposition is NonFileRootDisposition`
