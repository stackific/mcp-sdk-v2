[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isTasksActiveForRequest

# Function: isTasksActiveForRequest()

> **isTasksActiveForRequest**(`requestClientExtensions`, `serverExtensions`): `boolean`

Defined in: [protocol/tasks.ts:167](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tasks.ts#L167)

Returns `true` when the Tasks extension is ACTIVE for a single request: the
request's client capabilities declare it AND the server advertises it. (§25.2,
R-25.2-c, R-25.2-d)

This is the gate the server consults before it may return a task handle: when
`false`, the server MUST NOT substitute a `CreateTaskResult` for this request's
direct result (R-25.2-d). Computed per request under the stateless model —
nothing from a prior request is consulted (§24.4 / S38
[activeSetForRequest](activeSetForRequest.md)).

## Parameters

### requestClientExtensions

`unknown`

This request's declared client `extensions` map.

### serverExtensions

`unknown`

The server's advertised `extensions` map.

## Returns

`boolean`
