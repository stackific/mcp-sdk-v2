[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / clientSupportsElicitationMode

# Function: clientSupportsElicitationMode()

> **clientSupportsElicitationMode**(`clientCaps`, `mode`): `boolean`

Defined in: [protocol/elicitation.ts:440](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/elicitation.ts#L440)

Returns `true` when the client declaring `clientCaps` supports `mode`, applying
the empty-object-equals-form-only equivalence. (§20.1, R-20.1-c, R-20.1-f)

`form` is supported whenever `elicitation` is declared; `url` requires the
`elicitation.url` sub-flag.

## Parameters

### clientCaps

`Record`\<`string`, `unknown`\>

The client's declared `ClientCapabilities`.

### mode

[`ElicitationMode`](../type-aliases/ElicitationMode.md)

The mode to test.

## Returns

`boolean`
