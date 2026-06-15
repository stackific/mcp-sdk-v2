[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / classifyNotificationStream

# Function: classifyNotificationStream()

> **classifyNotificationStream**(`method`): [`NotificationStreamPlacement`](../type-aliases/NotificationStreamPlacement.md)

Defined in: [protocol/streaming.ts:502](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/streaming.ts#L502)

Classifies a notification `method` against the §10.6 boundary:
  - one of the four change kinds → `'subscription'`. (R-10.6-c)
  - `notifications/progress` / `notifications/message` → `'request-scoped'`. (R-10.6-a)
  - anything else → `'neither'`.

## Parameters

### method

`string`

## Returns

[`NotificationStreamPlacement`](../type-aliases/NotificationStreamPlacement.md)
