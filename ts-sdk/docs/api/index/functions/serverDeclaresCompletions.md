[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / serverDeclaresCompletions

# Function: serverDeclaresCompletions()

> **serverDeclaresCompletions**(`serverCaps`): `boolean`

Defined in: [protocol/completion.ts:148](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/completion.ts#L148)

Returns `true` when `serverCaps` declares the `completions` capability — the
gate a client MUST pass before sending `completion/complete`. (R-19.1-a,
R-19.1-c, AC-29.1, AC-29.2)

Delegates to `serverDeclares` (S10): presence of the `completions` object means
declared.

## Parameters

### serverCaps

`Record`\<`string`, `unknown`\>

## Returns

`boolean`
