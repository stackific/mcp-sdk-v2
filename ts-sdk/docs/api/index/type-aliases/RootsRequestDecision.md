[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / RootsRequestDecision

# Type Alias: RootsRequestDecision

> **RootsRequestDecision** = \{ `action`: `"request"`; \} \| \{ `action`: `"proceed-without-roots"`; \}

Defined in: [protocol/roots.ts:202](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/roots.ts#L202)

Outcome of [decideRootsRequest](../functions/decideRootsRequest.md).

## Union Members

### Type Literal

\{ `action`: `"request"`; \}

The client declared `roots`; the server MAY embed a `roots/list` input request.

***

### Type Literal

\{ `action`: `"proceed-without-roots"`; \}

The client did NOT declare `roots`; the server MUST proceed without roots.
