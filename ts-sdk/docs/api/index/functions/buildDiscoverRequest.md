[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildDiscoverRequest

# Function: buildDiscoverRequest()

> **buildDiscoverRequest**(`id`, `protocolVersion`, `clientInfo`, `clientCapabilities`, `extraMeta?`): `object`

Defined in: [protocol/discovery.ts:389](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/discovery.ts#L389)

Builds a complete `server/discover` JSON-RPC request carrying the three
REQUIRED reserved `_meta` keys, plus any additional `_meta` keys. (§5.3.1)

## Parameters

### id

`string` \| `number`

The JSON-RPC request id.

### protocolVersion

`string`

The revision this request declares.

### clientInfo

`objectOutputType`

The client's `Implementation` identity.

### clientCapabilities

`Record`\<`string`, `unknown`\>

The client's declared capabilities (`{}` is valid).

### extraMeta?

`Record`\<`string`, `unknown`\>

OPTIONAL additional `_meta` keys (R-5.3.1-e).

## Returns

`object`

### jsonrpc

> **jsonrpc**: `"2.0"`

### id

> **id**: `string` \| `number`

### method

> **method**: `"server/discover"`

### params

> **params**: `object`

#### params.\_meta

> **\_meta**: [`MetaObject`](../type-aliases/MetaObject.md)
