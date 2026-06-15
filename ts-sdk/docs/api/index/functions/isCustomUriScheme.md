[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isCustomUriScheme

# Function: isCustomUriScheme()

> **isCustomUriScheme**(`value`): `boolean`

Defined in: [protocol/resources-read.ts:584](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/resources-read.ts#L584)

Returns `true` when `value` is a valid RFC3986 URI whose scheme is NOT one of
the well-known schemes — i.e. a custom scheme. A custom scheme MUST conform to
RFC3986 (enforced via [isResourceUri](isResourceUri.md)); the SHOULD-level scheme-selection
guidance is advisory and not enforced here. (§17.9, R-17.9-a, R-17.9-e, R-17.9-f)

## Parameters

### value

`unknown`

## Returns

`boolean`
