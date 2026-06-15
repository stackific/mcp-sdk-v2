[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / mayServerAnswerToolsList

# Function: mayServerAnswerToolsList()

> **mayServerAnswerToolsList**(`serverCaps`, `method?`): `boolean`

Defined in: [protocol/tools.ts:108](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools.ts#L108)

Returns `true` when the server MAY respond to `tools/list` / `tools/call` — i.e.
it has declared the `tools` capability. A server MUST NOT respond otherwise.
(§16.1, R-16.1-c; the `tools/list` and `tools/call` methods are both gated on
the `tools` capability via S10's `SERVER_METHOD_CAPABILITY`.)

## Parameters

### serverCaps

`Record`\<`string`, `unknown`\>

### method?

`string` = `TOOLS_LIST_METHOD`

`"tools/list"` or `"tools/call"`.

## Returns

`boolean`
