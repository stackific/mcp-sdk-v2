[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / clientMayIssueResourceRequest

# Function: clientMayIssueResourceRequest()

> **clientMayIssueResourceRequest**(`method`, `serverCaps`): `boolean`

Defined in: [protocol/resources.ts:130](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/resources.ts#L130)

Returns `true` when a client MAY issue the resource request `method` against a
server with `serverCaps`. Mirror of [mayAcceptResourceRequest](mayAcceptResourceRequest.md) from the
client's perspective. (§17.1, R-17.1-j)

## Parameters

### method

`string`

### serverCaps

`Record`\<`string`, `unknown`\>

## Returns

`boolean`
