[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / TASK\_RESULT\_TYPE

# Variable: TASK\_RESULT\_TYPE

> `const` **TASK\_RESULT\_TYPE**: `"task"`

Defined in: [protocol/tasks.ts:92](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tasks.ts#L92)

The literal `resultType` discriminator value that marks a result as a task
handle: `"task"`. (§25.3, R-25.3-c)

This is an extension-contributed `resultType` value (it is NOT one of the core
`RESULT_TYPE` values); it is only valid when the Tasks extension is active for
the interaction (§24.5 / S38). A client that has declared the capability MUST
dispatch on this value via [isTaskResultType](../functions/isTaskResultType.md) / [isCreateTaskResult](../functions/isCreateTaskResult.md).
