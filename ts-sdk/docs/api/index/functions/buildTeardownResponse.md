[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildTeardownResponse

# Function: buildTeardownResponse()

> **buildTeardownResponse**(`id`): `object`

Defined in: [protocol/ui-host.ts:1021](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui-host.ts#L1021)

Builds the empty `{}` success response a UI returns to a `ui/resource-teardown`
request after releasing its resources. (§26.5.4, R-26.5.4-a; AC-42.11)

## Parameters

### id

[`JsonRpcId`](../type-aliases/JsonRpcId.md)

The teardown request id being answered.

## Returns

`object`

### jsonrpc

> **jsonrpc**: `"2.0"`

### id

> **id**: [`JsonRpcId`](../type-aliases/JsonRpcId.md)

### result

> **result**: `Record`\<`string`, `never`\>
