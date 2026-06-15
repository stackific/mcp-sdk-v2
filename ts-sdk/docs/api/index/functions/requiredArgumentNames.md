[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / requiredArgumentNames

# Function: requiredArgumentNames()

> **requiredArgumentNames**(`prompt`): `string`[]

Defined in: [protocol/prompts.ts:235](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/prompts.ts#L235)

Returns the names of every argument the prompt declares with `required: true` —
the set a `prompts/get` request MUST supply a value for. (R-18.3-l, R-18.4-e,
AC-28.27)

A prompt with no `arguments` (absent or empty) requires none. (R-18.3-c)

## Parameters

### prompt

`Pick`\<[`Prompt`](../type-aliases/Prompt.md), `"arguments"`\>

## Returns

`string`[]
