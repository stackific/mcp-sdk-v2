[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildResourceReadInternalError

# Function: buildResourceReadInternalError()

> **buildResourceReadInternalError**(`message?`): `object`

Defined in: [protocol/resources-read.ts:164](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/resources-read.ts#L164)

Builds the `-32603` (Internal error) a server SHOULD return for a failure
UNRELATED to the validity of the requested `uri` (e.g. a backing store is
unreachable). Distinct from [buildResourceNotFoundError](buildResourceNotFoundError.md), which is for a
`uri` that simply does not exist. (§17.6, R-17.6-d)

## Parameters

### message?

`string` = `'Internal error reading resource'`

## Returns

`object`

### code

> **code**: `-32603`

### message

> **message**: `string`
