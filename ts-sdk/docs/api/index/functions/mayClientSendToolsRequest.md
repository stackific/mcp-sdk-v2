[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / mayClientSendToolsRequest

# Function: mayClientSendToolsRequest()

> **mayClientSendToolsRequest**(`serverCaps`, `method?`): `boolean`

Defined in: [protocol/tools.ts:124](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools.ts#L124)

Returns `true` when a client MAY send `tools/list` / `tools/call` to the
server — only when the server has declared the `tools` capability. A client
MUST NOT send either otherwise. (§16.1, R-16.1-d; delegates to S10
`mayClientInvoke`.)

## Parameters

### serverCaps

`Record`\<`string`, `unknown`\>

### method?

`string` = `TOOLS_LIST_METHOD`

`"tools/list"` or `"tools/call"`.

## Returns

`boolean`
