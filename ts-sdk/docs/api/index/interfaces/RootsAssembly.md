[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / RootsAssembly

# Interface: RootsAssembly

Defined in: [protocol/roots.ts:460](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/roots.ts#L460)

Outcome of [assembleListRootsResult](../functions/assembleListRootsResult.md).

## Properties

### result

> **result**: `objectOutputType`

Defined in: [protocol/roots.ts:462](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/roots.ts#L462)

The validated listing to supply as the `roots/list` input response.

***

### excluded

> **excluded**: `object`[]

Defined in: [protocol/roots.ts:464](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/roots.ts#L464)

Candidates excluded, with the reason each was dropped.

#### root

> **root**: `objectOutputType`

#### reason

> **reason**: `"not-in-scope"` \| `"no-consent"` \| `"invalid-uri"` \| `"path-traversal"`
