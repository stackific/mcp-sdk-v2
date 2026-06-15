[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / clientSupportsElicitation

# Function: clientSupportsElicitation()

> **clientSupportsElicitation**(`clientCaps`): `boolean`

Defined in: [protocol/elicitation.ts:403](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/elicitation.ts#L403)

Returns `true` when `clientCaps` declares the `elicitation` capability — the
MUST-declare-to-use rule. A client that does not declare it is treated as not
supporting elicitation. (§20.1, R-20.1-a)

Delegates to S10's `clientDeclares` (presence-means-supported).

## Parameters

### clientCaps

`Record`\<`string`, `unknown`\>

The client's declared `ClientCapabilities`.

## Returns

`boolean`
