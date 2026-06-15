[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / classifyToolCallFailure

# Function: classifyToolCallFailure()

> **classifyToolCallFailure**(`situation`): [`ToolFailureMechanism`](../type-aliases/ToolFailureMechanism.md)

Defined in: [protocol/errors.ts:552](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/errors.ts#L552)

Decides whether a `tools/call` failure is reported as a JSON-RPC protocol
error (`-32602`) or as a successful result with `isError: true`. (R-22.5-a,
R-22.5-b, R-22.5-c, R-22.5-d, R-22.5-e, R-22.5-f, AC-34.18)

Undispatchable / schema-invalid requests (`unknown-tool`, `invalid-arguments`)
are PROTOCOL errors and MUST never produce `isError: true` (R-22.5-f); a tool
that ran and failed (`execution-failure`) is an ERROR RESULT and MUST never
produce a JSON-RPC error (R-22.5-e). The mapping is total and never the
reverse.

## Parameters

### situation

[`ToolCallFailureSituation`](../type-aliases/ToolCallFailureSituation.md)

## Returns

[`ToolFailureMechanism`](../type-aliases/ToolFailureMechanism.md)
