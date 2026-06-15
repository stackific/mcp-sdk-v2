[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / serverDeclaresPrompts

# Function: serverDeclaresPrompts()

> **serverDeclaresPrompts**(`serverCaps`): `boolean`

Defined in: [protocol/prompts.ts:136](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/prompts.ts#L136)

Returns `true` when `serverCaps` declares the `prompts` capability — the gate a
client MUST pass before sending `prompts/list` or `prompts/get`. (R-18.1-a,
R-18.1-b, AC-28.2, AC-28.3)

Delegates to `serverDeclares` (S10): presence of the `prompts` object means
declared.

## Parameters

### serverCaps

`Record`\<`string`, `unknown`\>

## Returns

`boolean`
