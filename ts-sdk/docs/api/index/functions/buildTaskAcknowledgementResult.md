[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildTaskAcknowledgementResult

# Function: buildTaskAcknowledgementResult()

> **buildTaskAcknowledgementResult**(): `objectOutputType`

Defined in: [protocol/tasks-lifecycle.ts:439](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tasks-lifecycle.ts#L439)

Builds the empty `"complete"` acknowledgement a server returns on a successful
`tasks/update` or `tasks/cancel`. The acknowledgement is eventually consistent:
for `tasks/update` the observable status may not yet reflect the responses, and
for `tasks/cancel` the task MAY remain non-terminal (or reach a terminal status
other than `cancelled`). (§25.8, §25.9, R-25.8-j, R-25.8-k, R-25.8-l, R-25.9-e,
R-25.9-f, R-25.9-h, R-25.9-i, AC-40.19, AC-40.26)

## Returns

`objectOutputType`
