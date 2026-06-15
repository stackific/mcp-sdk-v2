[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / enforceInputBounds

# Function: enforceInputBounds()

> **enforceInputBounds**(`options`): [`InputBoundsValidation`](../type-aliases/InputBoundsValidation.md)

Defined in: [protocol/security.ts:1501](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L1501)

Bounds the resources consumed while validating a peer input: rejects a schema
whose nesting depth exceeds the limit (reusing S25's [schemaNestingDepth](schemaNestingDepth.md),
which itself caps recursion) and a payload exceeding the size limit. (§28.10,
R-28.10-k, R-28.10-l; AC-44.28)

A receiver MUST bound schema nesting depth (R-28.10-k); the depth probe stops at
the cap so a pathological self-referential schema cannot exhaust the stack while
being measured. The payload-size check uses the UTF-8 byte length of the
serialized payload, when supplied.

## Parameters

### options

#### schema?

`unknown`

The schema to depth-bound. (R-28.10-k)

#### serializedPayload?

`string`

OPTIONAL serialized payload whose size is bounded. (R-28.10-l)

#### bounds?

[`InputBounds`](../interfaces/InputBounds.md)

The bounds to enforce; defaults to [DEFAULT\_INPUT\_BOUNDS](../variables/DEFAULT_INPUT_BOUNDS.md).

## Returns

[`InputBoundsValidation`](../type-aliases/InputBoundsValidation.md)
