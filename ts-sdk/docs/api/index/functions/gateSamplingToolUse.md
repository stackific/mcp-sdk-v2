[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / gateSamplingToolUse

# Function: gateSamplingToolUse()

> **gateSamplingToolUse**(`clientCaps`, `params`): [`SamplingGateResult`](../type-aliases/SamplingGateResult.md)

Defined in: [protocol/sampling.ts:570](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/sampling.ts#L570)

Client-side gate: returns an error when a tool-enabled sampling request arrives
but the client did not declare `sampling.tools`. (R-21.2.3-b, R-21.2.4-n,
R-21.2.4-o)

`tools` is checked before `toolChoice` so the error names the first offending
field deterministically. When `sampling.tools` is declared, or the request is
not tool-enabled, returns `{ ok: true }`.

## Parameters

### clientCaps

`Record`\<`string`, `unknown`\>

The client's declared `ClientCapabilities`.

### params

The incoming sampling params.

#### tools?

`unknown`

#### toolChoice?

`unknown`

## Returns

[`SamplingGateResult`](../type-aliases/SamplingGateResult.md)
