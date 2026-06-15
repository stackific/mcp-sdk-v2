[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isTasksExtensionId

# Function: isTasksExtensionId()

> **isTasksExtensionId**(`identifier`): `boolean`

Defined in: [protocol/tasks.ts:77](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tasks.ts#L77)

Returns `true` only when `identifier` is byte-identical to
[TASKS\_EXTENSION\_ID](../variables/TASKS_EXTENSION_ID.md). (§25.1, R-25.1-a)

Comparison is exact and case-sensitive: identifiers differing only in case
(`IO.MODELCONTEXTPROTOCOL/TASKS`) or by a prefix/suffix
(`io.modelcontextprotocol/tasks-foo`) are NON-matching. Delegates to the S38
octet-for-octet [extensionIdsMatch](extensionIdsMatch.md) so the no-case-folding rule is shared.

## Parameters

### identifier

`string`

## Returns

`boolean`
