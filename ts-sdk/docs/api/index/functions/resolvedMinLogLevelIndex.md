[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / resolvedMinLogLevelIndex

# Function: resolvedMinLogLevelIndex()

> **resolvedMinLogLevelIndex**(`logLevelOptIn`): `number`

Defined in: [protocol/logging.ts:136](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/logging.ts#L136)

Returns the minimum numeric severity index that should be emitted for a
request bearing `logLevelOptIn`. Used by server implementations to filter
log notifications.

Returns `-1` when no `logLevel` opt-in is present, indicating that no log
notifications MUST be emitted. (R-15.3.3-a)

## Parameters

### logLevelOptIn

`unknown`

The raw value of `io.modelcontextprotocol/logLevel`, or
  `undefined` / `null` when the key is absent from `_meta`.

## Returns

`number`
