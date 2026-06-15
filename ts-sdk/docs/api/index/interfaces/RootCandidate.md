[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / RootCandidate

# Interface: RootCandidate

Defined in: [protocol/roots.ts:450](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/roots.ts#L450)

A candidate root a client is considering exposing, paired with consent state.

## Properties

### root

> **root**: `objectOutputType`

Defined in: [protocol/roots.ts:452](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/roots.ts#L452)

The candidate root entry.

***

### consented

> **consented**: `boolean`

Defined in: [protocol/roots.ts:454](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/roots.ts#L454)

Whether the user has consented to exposing this root. (R-21.1.5-h · SHOULD)

***

### inScope

> **inScope**: `boolean`

Defined in: [protocol/roots.ts:456](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/roots.ts#L456)

Whether the client intends the server to treat this root as in-scope. (R-21.1.5-g · MUST)
