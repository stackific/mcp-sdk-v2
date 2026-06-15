[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / shouldTolerateUnavailableRoot

# Function: shouldTolerateUnavailableRoot()

> **shouldTolerateUnavailableRoot**(`_root`): `boolean`

Defined in: [protocol/roots.ts:545](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/roots.ts#L545)

Returns `true` when a server SHOULD tolerate a previously-reported root that
has since become unavailable, i.e. it MUST NOT fail solely because a reported
root is now gone. (R-21.1.5-j · SHOULD; AC-32.17)

Always `true`: the server tolerates unavailability rather than failing.

## Parameters

### \_root

`objectOutputType`

The previously-reported root that is now unavailable (unused;
  tolerance does not depend on which root).

## Returns

`boolean`
