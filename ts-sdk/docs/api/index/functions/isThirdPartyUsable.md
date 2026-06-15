[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isThirdPartyUsable

# Function: isThirdPartyUsable()

> **isThirdPartyUsable**(`identifier`): `boolean`

Defined in: [protocol/extensions.ts:138](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/extensions.ts#L138)

Returns `true` when a THIRD PARTY may define an extension under `identifier` —
the identifier must be well-formed and its prefix must not be reserved.
(R-6.5-g)

A malformed identifier is not third-party usable either; the prohibition in
R-6.5-g is specifically about reserved prefixes, but an unusable-for-anyone
malformed identifier is likewise not available to third parties.

## Parameters

### identifier

`string`

## Returns

`boolean`
