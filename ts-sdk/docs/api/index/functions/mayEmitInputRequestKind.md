[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / mayEmitInputRequestKind

# Function: mayEmitInputRequestKind()

> **mayEmitInputRequestKind**(`method`, `clientCapabilities`): `boolean`

Defined in: [protocol/multi-round-trip.ts:611](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/multi-round-trip.ts#L611)

Server-side gate: returns `true` when the server MAY emit an input-request of
`method` given the client's declared capabilities. A server MUST NOT emit a
kind the client has not declared — withhold it and return
[buildMissingCapabilityForMrtrError](buildMissingCapabilityForMrtrError.md) instead. (§11.2 line 2406, §11.5
line 2511; R-11.2-j, R-11.5-g)

## Parameters

### method

`string`

### clientCapabilities

`Record`\<`string`, `unknown`\>

## Returns

`boolean`
