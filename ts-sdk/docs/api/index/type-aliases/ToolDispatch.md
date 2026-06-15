[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ToolDispatch

# Type Alias: ToolDispatch

> **ToolDispatch** = \{ `dispatched`: `true`; `tool`: [`DispatchableTool`](../interfaces/DispatchableTool.md); `arguments`: `Record`\<`string`, `unknown`\>; \} \| \{ `dispatched`: `false`; `error`: [`ToolProtocolError`](../interfaces/ToolProtocolError.md); \}

Defined in: [protocol/tools-call.ts:443](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools-call.ts#L443)

Outcome of [dispatchToolCall](../functions/dispatchToolCall.md): either the request reaches the tool
(`dispatched: true`, with the resolved `arguments` per R-16.5-e), or it fails
to dispatch and a JSON-RPC PROTOCOL error MUST be returned (`dispatched: false`).
These are the two layers §16.6 keeps strictly distinct. (R-16.6-a)
