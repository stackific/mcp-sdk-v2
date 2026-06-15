[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / mayUseIncludeContext

# Function: mayUseIncludeContext()

> **mayUseIncludeContext**(`clientCaps`, `value`): `boolean`

Defined in: [protocol/capability-negotiation.ts:392](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/capability-negotiation.ts#L392)

Returns whether a server MAY use a given `includeContext` value during
sampling, given the client's capabilities. (R-6.2-o)

When `sampling.context` is absent the server SHOULD only use
`includeContext: "none"` (or omit it entirely); when present, any value is
allowed.

## Parameters

### clientCaps

`Record`\<`string`, `unknown`\>

### value

`"none"` \| `"thisServer"` \| `"allServers"` \| `undefined`

## Returns

`boolean`
