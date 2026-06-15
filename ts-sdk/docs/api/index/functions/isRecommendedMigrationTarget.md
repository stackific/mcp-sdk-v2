[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isRecommendedMigrationTarget

# Function: isRecommendedMigrationTarget()

> **isRecommendedMigrationTarget**(`target`): target is "tool-input-parameters" \| "resource-uris" \| "server-configuration"

Defined in: [protocol/roots.ts:110](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/roots.ts#L110)

Returns `true` when `target` is a recommended migration mechanism a builder
SHOULD adopt for new functionality instead of roots. (R-21.1.1-b · SHOULD;
AC-32.1)

The string `"roots"` is intentionally NOT a member, so passing it returns
`false` — roots MUST NOT be adopted for new functionality.

## Parameters

### target

`string`

## Returns

target is "tool-input-parameters" \| "resource-uris" \| "server-configuration"
