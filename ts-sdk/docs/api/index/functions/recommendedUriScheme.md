[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / recommendedUriScheme

# Function: recommendedUriScheme()

> **recommendedUriScheme**(`directlyFetchable`): `object`

Defined in: [protocol/resources-read.ts:622](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/resources-read.ts#L622)

Scheme-selection guidance (§17.9, R-17.9-b, R-17.9-c): a server SHOULD use the
`https` scheme ONLY when the client can fetch and load the resource directly
from the web on its own; for any OTHER case it SHOULD prefer another scheme (or
define a custom one) EVEN IF the server itself downloads the contents over the
internet.

Returns the SHOULD-recommended scheme posture for a resource:
  - `directlyFetchable: true`  → recommends `https`. (R-17.9-b)
  - `directlyFetchable: false` → recommends a non-`https` scheme. (R-17.9-c)

This encodes the SHOULD as advice a server can consult; it does not forbid
other choices.

## Parameters

### directlyFetchable

`boolean`

## Returns

`object`

### scheme

> **scheme**: `"https"` \| `"non-https"`

### rationale

> **rationale**: `string`
