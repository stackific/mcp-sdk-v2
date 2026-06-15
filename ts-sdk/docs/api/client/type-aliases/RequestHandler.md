[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [client](../README.md) / RequestHandler

# Type Alias: RequestHandler

> **RequestHandler** = (`params`, `extra`) => `unknown` \| `Promise`\<`unknown`\>

Defined in: client/client.ts:68

Handles an inbound server→client request (e.g. `sampling/createMessage`,
`elicitation/create`, `roots/list`). The returned object becomes the JSON-RPC
`result`; throwing a [RequestError](../classes/RequestError.md) maps to a JSON-RPC error response.

## Parameters

### params

`Record`\<`string`, `unknown`\>

### extra

#### id

[`RequestId`](../../index/type-aliases/RequestId.md)

#### method

`string`

## Returns

`unknown` \| `Promise`\<`unknown`\>
