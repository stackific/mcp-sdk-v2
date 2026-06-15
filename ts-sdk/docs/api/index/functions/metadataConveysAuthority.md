[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / metadataConveysAuthority

# Function: metadataConveysAuthority()

> **metadataConveysAuthority**(`_key?`): `false`

Defined in: [protocol/security.ts:1207](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L1207)

Returns `false` — metadata MUST NOT be a source of authority. (§28.9, R-28.9-a;
AC-44.23)

Trace identifiers, progress tokens, and similar fields MUST NOT be used for
authentication, authorization, or any access-control decision; a peer can set
them to arbitrary values. This is unconditional, so a caller cannot accidentally
derive authority from a metadata field: `if (metadataConveysAuthority(...)) ...`
is always the `false` branch.

## Parameters

### \_key?

`string`

The metadata key (ignored; the rule is unconditional).

## Returns

`false`
