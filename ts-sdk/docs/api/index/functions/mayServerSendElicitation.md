[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / mayServerSendElicitation

# Function: mayServerSendElicitation()

> **mayServerSendElicitation**(`clientCaps`, `mode?`): `boolean`

Defined in: [protocol/elicitation.ts:496](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/elicitation.ts#L496)

Convenience predicate: `true` exactly when [gateElicitationRequest](gateElicitationRequest.md)
permits a server to send an `elicitation/create` request of `mode`. (§20.1,
R-20.1-d, R-20.1-e)

## Parameters

### clientCaps

`Record`\<`string`, `unknown`\>

### mode?

[`ElicitationMode`](../type-aliases/ElicitationMode.md) = `ELICITATION_MODE.FORM`

## Returns

`boolean`
