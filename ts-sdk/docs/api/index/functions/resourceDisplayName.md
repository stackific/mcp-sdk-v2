[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / resourceDisplayName

# Function: resourceDisplayName()

> **resourceDisplayName**(`resource`): `string`

Defined in: [protocol/resources.ts:354](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/resources.ts#L354)

Resolves the user-facing label for a `Resource`: prefer `title`, fall back to
`name`. (§17.4, R-17.4-e) Reuses the canonical S20 [resolveDisplayName](resolveDisplayName.md).

## Parameters

### resource

`Pick`\<[`Resource`](../type-aliases/Resource.md), `"name"` \| `"title"`\>

## Returns

`string`
