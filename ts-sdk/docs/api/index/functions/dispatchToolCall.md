[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / dispatchToolCall

# Function: dispatchToolCall()

> **dispatchToolCall**(`params`, `exposedTools`): [`ToolDispatch`](../type-aliases/ToolDispatch.md)

Defined in: [protocol/tools-call.ts:469](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools-call.ts#L469)

Performs the §16.6 dispatch decision for a `tools/call`, returning a structured
outcome rather than throwing. This is the boundary between the two error
layers: it resolves protocol-level dispatchability ONLY; a tool that dispatches
and then fails reports that failure as a `CallToolResult` with `isError: true`
(see [buildToolExecutionError](buildToolExecutionError.md)), which is NOT this function's concern.
(§16.6, R-16.6-a, R-16.6-d)

Decision, in order:
  1. Unknown tool name (no tool in `exposedTools` matches `params.name`) ⇒
     `{ dispatched: false }` with a `-32602` error (R-16.5-b, R-16.6-e).
  2. `arguments` (defaulting to `{}` when omitted, R-16.5-e) fail to validate
     against the tool's `inputSchema` ⇒ `{ dispatched: false }` with a `-32602`
     error and the tool is NOT invoked (R-16.5-d, R-16.6-f).
  3. Otherwise ⇒ `{ dispatched: true }` carrying the matched tool and the
     resolved `arguments`, ready for the tool to run.

Tool names are matched case-sensitively, per S24's name conventions (R-16.3-e).

## Parameters

### params

The parsed `tools/call` params.

#### name

`string`

#### arguments?

`Record`\<`string`, `unknown`\>

### exposedTools

readonly [`DispatchableTool`](../interfaces/DispatchableTool.md)[]

The tools the server currently exposes to the caller.

## Returns

[`ToolDispatch`](../type-aliases/ToolDispatch.md)
