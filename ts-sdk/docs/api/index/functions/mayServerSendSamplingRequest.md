[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / mayServerSendSamplingRequest

# Function: mayServerSendSamplingRequest()

> **mayServerSendSamplingRequest**(`clientCaps`, `params`): `boolean`

Defined in: [protocol/sampling.ts:589](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/sampling.ts#L589)

Server-side gate: returns `true` only when the server MAY send the given
sampling params to a client with `clientCaps`. (R-21.2.3-a)

A server MUST NOT send a tool-enabled request to a client lacking
`sampling.tools`, and MUST NOT invoke sampling at all unless the client
declared `sampling`. The `includeContext` deprecation gate (R-21.2.3-c,
R-21.2.4-e) is checked via [mayUseIncludeContext](mayUseIncludeContext.md).

## Parameters

### clientCaps

`Record`\<`string`, `unknown`\>

### params

#### tools?

`unknown`

#### toolChoice?

`unknown`

#### includeContext?

`"none"` \| `"thisServer"` \| `"allServers"`

## Returns

`boolean`
