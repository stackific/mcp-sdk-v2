[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / TaskExecutionOutcome

# Type Alias: TaskExecutionOutcome

> **TaskExecutionOutcome** = `"failed"` \| `"completed"`

Defined in: [protocol/tasks-lifecycle.ts:765](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tasks-lifecycle.ts#L765)

The outcome classification a server applies when an augmented request finishes,
enforcing the strict §25.11 separation between protocol-level faults and
application-level outcomes. (§25.11, R-25.11-f … R-25.11-i)

  - `"failed"`    — a JSON-RPC PROTOCOL error occurred during execution; the
    task moves to `failed` with the `error` field carrying that JSON-RPC error
    (and SHOULD include a diagnostic `statusMessage`). (R-25.11-f, R-25.11-g)
  - `"completed"` — the request completed at the protocol level; any
    application-level error (e.g. a tool result with `isError: true`) is carried
    INSIDE the `result` field, NOT as a `failed` task. (R-25.11-h, R-25.11-i)
