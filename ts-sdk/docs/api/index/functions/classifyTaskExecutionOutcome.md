[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / classifyTaskExecutionOutcome

# Function: classifyTaskExecutionOutcome()

> **classifyTaskExecutionOutcome**(`finished`): [`TaskExecutionOutcome`](../type-aliases/TaskExecutionOutcome.md)

Defined in: [protocol/tasks-lifecycle.ts:780](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tasks-lifecycle.ts#L780)

Classifies how a finished augmented request maps onto a terminal task status,
enforcing R-25.11-h/i: `failed` is used ONLY for JSON-RPC protocol-level errors;
an application-level error returned within an otherwise-successful result maps to
`completed` (the error stays inside `result`). (§25.11, R-25.11-f, R-25.11-h,
R-25.11-i, AC-40.42, AC-40.43)

## Parameters

### finished

\{ `kind`: `"protocol-error"`; `error`: `unknown`; \} \| \{ `kind`: `"result"`; `result`: `unknown`; \}

The execution outcome:
  - `{ kind: "protocol-error", error }` — a JSON-RPC error occurred → `failed`;
  - `{ kind: "result", result }` — the request completed at the protocol level
    (even if `result` conveys an application error such as `isError: true`) →
    `completed`.

## Returns

[`TaskExecutionOutcome`](../type-aliases/TaskExecutionOutcome.md)
