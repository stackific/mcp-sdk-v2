[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / sanitizeConsumedMetadata

# Function: sanitizeConsumedMetadata()

> **sanitizeConsumedMetadata**(`metadata`, `known`): `Record`\<`string`, `unknown`\>

Defined in: [protocol/security.ts:1278](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L1278)

Validates the structure of consumed metadata, returning only the entries the
receiver understands and ignoring the rest. (§28.9, R-28.9-b; AC-44.23)

Receivers SHOULD validate metadata structure and ignore values they do not
understand; this keeps only keys in `known` (and only when the value is present),
so an unknown or malformed extra field is dropped rather than acted upon. It never
throws on a malformed input — a non-object yields `{}`.

## Parameters

### metadata

`unknown`

The raw metadata object from a peer.

### known

`Iterable`\<`string`\>

The metadata keys this receiver understands.

## Returns

`Record`\<`string`, `unknown`\>
