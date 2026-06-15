[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / clampToMaxTokens

# Function: clampToMaxTokens()

> **clampToMaxTokens**(`produced`, `maxTokens`): `number`

Defined in: [protocol/sampling.ts:487](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/sampling.ts#L487)

Clamps a produced token count to the request's `maxTokens` upper bound.
The client MAY sample fewer (R-21.2.4-i) but MUST NOT exceed `maxTokens`
(R-21.2.4-j). Returns the count unchanged when already within bound.

## Parameters

### produced

`number`

### maxTokens

`number`

## Returns

`number`
