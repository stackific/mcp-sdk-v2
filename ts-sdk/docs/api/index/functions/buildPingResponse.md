[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildPingResponse

# Function: buildPingResponse()

> **buildPingResponse**(`id`): `object`

Defined in: [protocol/ui-host.ts:1007](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui-host.ts#L1007)

Builds the prompt success response to a `ping`: an empty result `{}`. The
receiver MUST respond promptly so the sender can confirm the peer is live.
(§26.5.3, R-26.5.3-f, R-26.5.3-g; AC-42.10)

## Parameters

### id

[`JsonRpcId`](../type-aliases/JsonRpcId.md)

The `ping` request id being answered.

## Returns

`object`

### jsonrpc

> **jsonrpc**: `"2.0"`

### id

> **id**: [`JsonRpcId`](../type-aliases/JsonRpcId.md)

### result

> **result**: `Record`\<`string`, `never`\>
