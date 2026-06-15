[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isTasksExtensionCapability

# Function: isTasksExtensionCapability()

> **isTasksExtensionCapability**(`value`): `value is Record<string, unknown>`

Defined in: [protocol/tasks.ts:123](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tasks.ts#L123)

Returns `true` when `value` is a valid Tasks extension settings value — any
JSON object. (R-25.2-a, R-25.2-b)

The canonical value is `{}`; a value carrying unrecognized members is still
valid (the receiver accepts the declaration and ignores those members,
R-25.2-b). A non-object value (array, scalar, `null`) is NOT a settings object.

## Parameters

### value

`unknown`

## Returns

`value is Record<string, unknown>`
