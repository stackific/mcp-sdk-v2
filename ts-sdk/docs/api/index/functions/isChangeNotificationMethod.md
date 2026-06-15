[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isChangeNotificationMethod

# Function: isChangeNotificationMethod()

> **isChangeNotificationMethod**(`method`): method is "notifications/prompts/list\_changed" \| "notifications/resources/list\_changed" \| "notifications/resources/updated" \| "notifications/tools/list\_changed"

Defined in: [protocol/streaming.ts:79](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/streaming.ts#L79)

Returns `true` when `method` is one of the four subscription change kinds. (R-10.5-a)

## Parameters

### method

`string`

## Returns

method is "notifications/prompts/list\_changed" \| "notifications/resources/list\_changed" \| "notifications/resources/updated" \| "notifications/tools/list\_changed"
