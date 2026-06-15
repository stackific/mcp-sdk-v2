[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildUnknownToolError

# Function: buildUnknownToolError()

> **buildUnknownToolError**(`name`): [`ToolProtocolError`](../interfaces/ToolProtocolError.md)

Defined in: [protocol/tools-call.ts:403](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools-call.ts#L403)

Builds the JSON-RPC error for an UNKNOWN tool name — a `tools/call` whose
`name` does not match any tool the server currently exposes. MUST be reported
with code `-32602` (Invalid params), as a JSON-RPC error and never as a
`CallToolResult`. (§16.6, R-16.5-b, R-16.6-d, R-16.6-e)

## Parameters

### name

`string`

The unknown tool name from the request.

## Returns

[`ToolProtocolError`](../interfaces/ToolProtocolError.md)
