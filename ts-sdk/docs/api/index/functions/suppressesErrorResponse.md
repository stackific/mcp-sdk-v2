[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / suppressesErrorResponse

# Function: suppressesErrorResponse()

> **suppressesErrorResponse**(`message`): `boolean`

Defined in: [protocol/errors.ts:438](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/errors.ts#L438)

Returns `true` when a message MUST NOT receive any response — a JSON-RPC
notification, i.e. an object carrying `method` and no `id`. Notifications
never receive a response, error or otherwise. (R-22.1-g, R-22.6-i, AC-34.5)

Reuses the canonical [isNotification](isNotification.md) predicate from S01's messages
module (the same binding, never redefined); this wrapper only narrows an
arbitrary `unknown` to the object form that predicate expects.

## Parameters

### message

`unknown`

## Returns

`boolean`
