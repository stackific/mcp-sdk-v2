[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / resolveCallToolArguments

# Function: resolveCallToolArguments()

> **resolveCallToolArguments**(`params`): `Record`\<`string`, `unknown`\>

Defined in: [protocol/tools-call.ts:125](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools-call.ts#L125)

Resolves the effective `arguments` of a `tools/call`: the supplied object, or
the empty object `{}` when `arguments` is omitted. The server MUST treat an
omitted `arguments` as `{}`. (§16.5, R-16.5-e)

## Parameters

### params

#### arguments?

`Record`\<`string`, `unknown`\>

## Returns

`Record`\<`string`, `unknown`\>
