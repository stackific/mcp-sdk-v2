[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildListToolsResult

# Function: buildListToolsResult()

> **buildListToolsResult**(`config`): `objectOutputType`

Defined in: [protocol/tools.ts:741](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools.ts#L741)

Builds a `ListToolsResult` from a server's config. `resultType` is fixed to
`"complete"` (R-16.2-m). `nextCursor` and `_meta` are included only when
supplied — never defaulted. (§16.2)

## Parameters

### config

[`ListToolsResultConfig`](../interfaces/ListToolsResultConfig.md)

## Returns

`objectOutputType`

## Throws

When `ttlMs` is negative or not an integer (R-16.2-g).
