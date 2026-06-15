[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / TASK\_LIFECYCLE\_METHODS

# Variable: TASK\_LIFECYCLE\_METHODS

> `const` **TASK\_LIFECYCLE\_METHODS**: readonly \[`"tasks/get"`, `"tasks/update"`, `"tasks/cancel"`\]

Defined in: [protocol/tasks-lifecycle.ts:89](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tasks-lifecycle.ts#L89)

The three client→server Tasks-extension request methods introduced by S40.
(§25.7–§25.9) Each MUST be issued only over the negotiated
`io.modelcontextprotocol/tasks` capability; a server receiving any of them from
a client that did not declare it responds with `-32003`
([buildTasksMissingCapabilityError](../functions/buildTasksMissingCapabilityError.md)). (R-25.7-c/d, R-25.8-c/d, R-25.9-c/d)
