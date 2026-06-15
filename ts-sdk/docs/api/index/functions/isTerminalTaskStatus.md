[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isTerminalTaskStatus

# Function: isTerminalTaskStatus()

> **isTerminalTaskStatus**(`status`): `boolean`

Defined in: [protocol/tasks.ts:246](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tasks.ts#L246)

Returns `true` when `status` is a terminal state (`completed` / `failed` /
`cancelled`). (§25.5, R-25.5-b)

## Parameters

### status

`"input_required"` \| `"cancelled"` \| `"completed"` \| `"working"` \| `"failed"`

## Returns

`boolean`
