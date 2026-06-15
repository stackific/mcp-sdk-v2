[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / TaskInputResponsesSchema

# Variable: TaskInputResponsesSchema

> `const` **TaskInputResponsesSchema**: `ZodRecord`\<`ZodString`, `ZodUnknown`\>

Defined in: [protocol/tasks-lifecycle.ts:247](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tasks-lifecycle.ts#L247)

The `inputResponses` map carried by `tasks/update`: responses keyed by
currently-outstanding `inputRequests` keys. (§25.8)

Each value is shaped as the response to the corresponding server-to-client
request would be when surfaced inline (the `InputResponse` model is owned by
S17 / §11; e.g. an elicitation result per §20). This story does not redefine
the per-kind `InputResponse` shapes — values are accepted as JSON objects and
the key-binding rule (each key MUST match a currently-outstanding `inputRequests`
key) is enforced separately by [validateUpdateInputResponseKeys](../functions/validateUpdateInputResponseKeys.md). (R-25.8-b)
