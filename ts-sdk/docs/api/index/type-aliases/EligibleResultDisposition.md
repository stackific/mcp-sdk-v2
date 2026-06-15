[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / EligibleResultDisposition

# Type Alias: EligibleResultDisposition

> **EligibleResultDisposition** = \{ `kind`: `"task"`; `result`: [`CreateTaskResult`](CreateTaskResult.md); \} \| \{ `kind`: `"ordinary"`; `result`: `unknown`; \}

Defined in: [protocol/tasks.ts:404](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tasks.ts#L404)

What a client should do with a result received for an eligible (task-capable)
request. (§25.3, R-25.2-e, R-25.3-c)

  - `"task"`     — the payload is a [CreateTaskResult](CreateTaskResult.md) task handle;
  - `"ordinary"` — the payload is the request's ordinary result shape.
