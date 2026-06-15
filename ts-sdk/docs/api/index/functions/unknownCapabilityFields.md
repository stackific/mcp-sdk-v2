[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / unknownCapabilityFields

# Function: unknownCapabilityFields()

> **unknownCapabilityFields**(`caps`, `known`): `string`[]

Defined in: [protocol/extensions.ts:386](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/extensions.ts#L386)

Returns the capability fields in `caps` that `known` does not recognize.
A receiver MUST ignore exactly these fields and MUST NOT reject the capability
object (or the message carrying it) because they are present. (R-6.6-b,
R-6.6-c, R-6.6-f)

## Parameters

### caps

`Record`\<`string`, `unknown`\>

A raw `ClientCapabilities` / `ServerCapabilities` object.

### known

`ReadonlySet`\<`string`\>

The recognized field names (e.g.
  [KNOWN\_CLIENT\_CAPABILITY\_FIELDS](../variables/KNOWN_CLIENT_CAPABILITY_FIELDS.md)).

## Returns

`string`[]
