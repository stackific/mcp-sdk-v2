[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / suggestSuccessorIdentifier

# Function: suggestSuccessorIdentifier()

> **suggestSuccessorIdentifier**(`identifier`, `suffix?`): `string`

Defined in: [protocol/extension-mechanism.ts:535](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/extension-mechanism.ts#L535)

Suggests a successor extension identifier for an incompatible change, keeping
the two distinct in the negotiation map (e.g.
`com.example/my-extension → com.example/my-extension-2`). (R-24.6-d)

The suffix is appended to the identifier's NAME segment so the result is
itself a well-formed identifier under the same vendor prefix.

## Parameters

### identifier

`string`

### suffix?

`string` = `'2'`

## Returns

`string`

## Throws

when `identifier` is malformed.
