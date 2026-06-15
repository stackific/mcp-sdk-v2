[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / mayAcceptResourceRequest

# Function: mayAcceptResourceRequest()

> **mayAcceptResourceRequest**(`method`, `serverCaps`): `boolean`

Defined in: [protocol/resources.ts:117](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/resources.ts#L117)

Returns `true` when a server MAY accept the resource request `method` given its
declared capabilities — i.e. it is one of the three gated methods AND `resources`
is declared. A non-resource method returns `false`. (§17.1, R-17.1-h)

A client MUST NOT issue any of these requests when this returns `false`
(R-17.1-j); a server MUST NOT accept them. (R-17.1-h)

## Parameters

### method

`string`

### serverCaps

`Record`\<`string`, `unknown`\>

## Returns

`boolean`
