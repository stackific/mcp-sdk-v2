[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / resourceTemplateDisplayName

# Function: resourceTemplateDisplayName()

> **resourceTemplateDisplayName**(`template`): `string`

Defined in: [protocol/resources.ts:411](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/resources.ts#L411)

Resolves the user-facing label for a `ResourceTemplate`: prefer `title`, fall
back to `name`, as for `Resource`. (§17.4, R-17.4-e via R-17.4-p) Reuses S20.

## Parameters

### template

`Pick`\<[`ResourceTemplate`](../type-aliases/ResourceTemplate.md), `"name"` \| `"title"`\>

## Returns

`string`
