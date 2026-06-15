[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / routingNameFor

# Function: routingNameFor()

> **routingNameFor**(`method`, `params`): `string` \| `undefined`

Defined in: [transport/http/headers.ts:119](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/headers.ts#L119)

Returns the routing-name value for `method` from its `params`, or `undefined`
when the method carries no `Mcp-Name`. (R-9.4.2-b/c/d)

  - `tools/call`, `prompts/get` → `params.name`
  - `resources/read`           → `params.uri`

## Parameters

### method

`string`

### params

`Record`\<`string`, `unknown`\> \| `undefined`

## Returns

`string` \| `undefined`
