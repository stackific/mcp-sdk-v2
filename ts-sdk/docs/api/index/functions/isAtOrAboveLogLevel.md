[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isAtOrAboveLogLevel

# Function: isAtOrAboveLogLevel()

> **isAtOrAboveLogLevel**(`candidate`, `minimum`): `boolean`

Defined in: [protocol/meta.ts:126](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/meta.ts#L126)

Returns `true` when `candidate` severity is at or above `minimum`.
Implements the server-side filtering rule R-4.3-m.

## Parameters

### candidate

`"error"` \| `"debug"` \| `"info"` \| `"notice"` \| `"warning"` \| `"critical"` \| `"alert"` \| `"emergency"`

### minimum

`"error"` \| `"debug"` \| `"info"` \| `"notice"` \| `"warning"` \| `"critical"` \| `"alert"` \| `"emergency"`

## Returns

`boolean`
