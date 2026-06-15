[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ignoreUnknownCapabilityFields

# Function: ignoreUnknownCapabilityFields()

> **ignoreUnknownCapabilityFields**(`caps`, `known`): `Record`\<`string`, `unknown`\>

Defined in: [protocol/extensions.ts:406](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/extensions.ts#L406)

Produces the view of a capability object a receiver acts on: the recognized
fields only, with unrecognized fields dropped (ignored). The presence of an
unknown field never causes rejection — this function simply omits it.
(R-6.6-b, R-6.6-c, R-6.6-f, R-6.6-g)

Dropping an unknown field MUST NOT be read as the peer not supporting anything
the receiver DOES understand; the recognized fields are passed through
unchanged so no such inference can be drawn. (R-6.6-g)

## Parameters

### caps

`Record`\<`string`, `unknown`\>

A raw capability object (possibly carrying unknown fields).

### known

`ReadonlySet`\<`string`\>

The recognized field names for this object kind.

## Returns

`Record`\<`string`, `unknown`\>
