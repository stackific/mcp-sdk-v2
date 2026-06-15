[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / clientDeclares

# Function: clientDeclares()

> **clientDeclares**(`caps`, `capability`): `boolean`

Defined in: [protocol/capability-negotiation.ts:180](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/capability-negotiation.ts#L180)

Returns `true` when the client's capabilities declare `capability`. (§6.1)

Presence of an object means supported. Two special rules apply:
  - `elicitation.form` is supported whenever `elicitation` is present, even if
    the `form` sub-flag is absent — form mode is the implicit baseline. (R-6.2-e)
  - `elicitation.url`, `sampling.context`, `sampling.tools` require their own
    sub-flag object to be present. (R-6.2-f/g, R-6.2-n, R-6.2-p)

## Parameters

### caps

`Record`\<`string`, `unknown`\>

### capability

[`ClientCapabilityName`](../type-aliases/ClientCapabilityName.md)

## Returns

`boolean`
