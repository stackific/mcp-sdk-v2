[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildCallToolRequest

# Function: buildCallToolRequest()

> **buildCallToolRequest**(`id`, `config`): `objectOutputType`

Defined in: [protocol/tools-call.ts:149](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools-call.ts#L149)

Builds a first-issue `tools/call` JSON-RPC request. `arguments` and `_meta` are
included only when supplied — never defaulted to `{}` on the wire (the server
applies the omitted-arguments default, R-16.5-e). (§16.5)

## Parameters

### id

`string` \| `number`

The JSON-RPC request id.

### config

[`CallToolRequestConfig`](../interfaces/CallToolRequestConfig.md)

The tool name and OPTIONAL arguments / `_meta`.

## Returns

`objectOutputType`
