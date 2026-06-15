[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / interpretResultType

# Function: interpretResultType()

> **interpretResultType**(`result`): [`ResultTypeInterpretation`](../type-aliases/ResultTypeInterpretation.md)

Defined in: [jsonrpc/payload.ts:72](https://github.com/stackific/mcp-sdk-node/blob/main/src/jsonrpc/payload.ts#L72)

Interprets the `resultType` field of a received result, applying both
normative receiver rules from §3.6:

  R-3.6-i: an absent `resultType` MUST be treated as `"complete"` (interop
            fallback for servers that omit the field).
  R-3.6-f: an unrecognized value means the receiver MUST treat the whole
            response as an error — `recognized: false` signals this.
  R-3.6-g: when `recognized` is `false`, callers MUST NOT read other members.

## Parameters

### result

`Record`\<`string`, `unknown`\>

The raw result object received from the wire.

## Returns

[`ResultTypeInterpretation`](../type-aliases/ResultTypeInterpretation.md)
