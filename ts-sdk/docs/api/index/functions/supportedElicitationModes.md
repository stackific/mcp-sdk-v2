[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / supportedElicitationModes

# Function: supportedElicitationModes()

> **supportedElicitationModes**(`clientCaps`): [`ElicitationMode`](../type-aliases/ElicitationMode.md)[]

Defined in: [protocol/elicitation.ts:419](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/elicitation.ts#L419)

Returns the set of elicitation modes a client supports, applying the
empty-object-equals-form-only equivalence: declaring `elicitation` always
implies `form` (the implicit baseline), and `url` is added only when the
`elicitation.url` sub-flag is present. (§20.1, R-20.1-c, R-20.1-f)

Returns an empty array when `elicitation` is not declared at all. By
R-20.1-b, a client that declares `elicitation` therefore always supports at
least one mode (`form`).

## Parameters

### clientCaps

`Record`\<`string`, `unknown`\>

The client's declared `ClientCapabilities`.

## Returns

[`ElicitationMode`](../type-aliases/ElicitationMode.md)[]
