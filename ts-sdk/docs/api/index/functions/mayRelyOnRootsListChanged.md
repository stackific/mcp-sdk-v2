[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / mayRelyOnRootsListChanged

# Function: mayRelyOnRootsListChanged()

> **mayRelyOnRootsListChanged**(`_clientCaps`): `boolean`

Defined in: [protocol/roots.ts:195](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/roots.ts#L195)

Returns `false` for every input — a client MUST NOT rely on a
`listChanged`-style change-notification mechanism for roots in this revision,
regardless of what the `roots` capability value contains. (R-21.1.2-c ·
MUST NOT; AC-32.5)

## Parameters

### \_clientCaps

`Record`\<`string`, `unknown`\>

The client-capabilities object (unused; no sub-flag
  exists that could enable this, so the answer is always `false`).

## Returns

`boolean`
