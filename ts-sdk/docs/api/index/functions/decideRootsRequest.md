[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / decideRootsRequest

# Function: decideRootsRequest()

> **decideRootsRequest**(`clientCaps`): [`RootsRequestDecision`](../type-aliases/RootsRequestDecision.md)

Defined in: [protocol/roots.ts:221](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/roots.ts#L221)

Decides whether a server may request a roots listing from a client, given the
client's declared capabilities. (R-21.1.2-d · MUST NOT, R-21.1.2-e · MUST;
AC-32.6)

- When the client declares `roots`        → `{ action: 'request' }`.
- When the client does NOT declare `roots` → `{ action: 'proceed-without-roots' }`.
  A server MUST NOT request roots from such a client and MUST proceed without
  them.

Gating reuses `mayInvokeRootsList` (S10); this is the §21.1-level decision
wrapper expressing the proceed-without-roots fallback.

## Parameters

### clientCaps

`Record`\<`string`, `unknown`\>

## Returns

[`RootsRequestDecision`](../type-aliases/RootsRequestDecision.md)
