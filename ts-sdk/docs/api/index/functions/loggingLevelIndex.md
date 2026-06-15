[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / loggingLevelIndex

# Function: loggingLevelIndex()

> **loggingLevelIndex**(`level`): `number`

Defined in: [protocol/meta.ts:118](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/meta.ts#L118)

Returns the numeric severity index of a `LoggingLevel` value (lower = less severe).
Useful for deciding whether to emit a notification given a requested `logLevel`.

## Parameters

### level

`"error"` \| `"debug"` \| `"info"` \| `"notice"` \| `"warning"` \| `"critical"` \| `"alert"` \| `"emergency"`

## Returns

`number`
