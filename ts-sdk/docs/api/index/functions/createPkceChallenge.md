[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / createPkceChallenge

# Function: createPkceChallenge()

> **createPkceChallenge**(`randomSource?`): [`PkceChallenge`](../interfaces/PkceChallenge.md)

Defined in: [protocol/authorization-flow.ts:183](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L183)

Creates a complete PKCE pair (verifier + `S256` challenge + method). (R-23.5-a,
R-23.5-b)

PKCE is REQUIRED for this flow and the method MUST be `S256`; this is the single
entry point that yields a ready-to-use pair. Randomness is injectable for
deterministic tests.

## Parameters

### randomSource?

(`size`) => `Buffer`

OPTIONAL byte source; defaults to `node:crypto`.

## Returns

[`PkceChallenge`](../interfaces/PkceChallenge.md)
