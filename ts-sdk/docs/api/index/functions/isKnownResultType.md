[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isKnownResultType

# Function: isKnownResultType()

> **isKnownResultType**(`value`): value is "complete" \| "input\_required"

Defined in: [jsonrpc/payload.ts:49](https://github.com/stackific/mcp-sdk-node/blob/main/src/jsonrpc/payload.ts#L49)

Returns `true` when `value` is one of the two spec-defined `ResultType` values.

Use this to enforce R-3.6-f: a receiver that encounters an unrecognized
`resultType` MUST treat the whole response as an error and MUST NOT read
any other result members (R-3.6-g).

## Parameters

### value

`string`

## Returns

value is "complete" \| "input\_required"
