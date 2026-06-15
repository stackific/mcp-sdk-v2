[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isPollingTerminalResponse

# Function: isPollingTerminalResponse()

> **isPollingTerminalResponse**(`response`): `boolean`

Defined in: [protocol/tasks-lifecycle.ts:716](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tasks-lifecycle.ts#L716)

Returns `true` when a client should STOP polling a task after a `tasks/get`
response: either a `-32602` error (the task is unknown/expired — terminal and
unavailable) or a terminal `DetailedTask`. (§25.7, §25.11, R-25.7-s, R-25.11-e,
AC-40.12)

## Parameters

### response

`unknown`

A raw `tasks/get` response: either an error object
  (`{ code, ... }`) or a `DetailedTask`-shaped result (`{ status, ... }`).

## Returns

`boolean`
