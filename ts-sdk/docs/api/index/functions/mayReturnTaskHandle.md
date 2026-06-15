[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / mayReturnTaskHandle

# Function: mayReturnTaskHandle()

> **mayReturnTaskHandle**(`requestClientExtensions`, `serverExtensions`): `boolean`

Defined in: [protocol/tasks.ts:189](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tasks.ts#L189)

Decides whether a server MAY return a task handle for a request, enforcing the
§25.2 gating rules. (R-25.2-d, R-25.2-g, R-25.3-a, R-25.3-b)

Returns `true` only when the extension is active for THIS request
([isTasksActiveForRequest](isTasksActiveForRequest.md)). When `true`, the substitution is entirely
server-directed: the server MAY (but need not) turn any individual eligible
request into a task, with no per-call flag or warmup beyond the per-request
capability (R-25.2-g, R-25.3-a, R-25.3-b). When `false`, the server MUST NOT
return a result with `resultType` equal to `"task"` (R-25.2-d).

## Parameters

### requestClientExtensions

`unknown`

This request's declared client `extensions` map.

### serverExtensions

`unknown`

The server's advertised `extensions` map.

## Returns

`boolean`
