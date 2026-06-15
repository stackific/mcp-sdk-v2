[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / hasExactlyResultOrError

# Function: hasExactlyResultOrError()

> **hasExactlyResultOrError**(`response`): `boolean`

Defined in: [protocol/errors.ts:388](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/errors.ts#L388)

Validates a single response object's mutual-exclusion invariant: it MUST
carry exactly one of `result` or `error` — never both, never neither.
(R-22.1-a, AC-34.1) The exactly-one-of rule and the envelope shape are owned
by S03; this is the §22 view used to reject a non-conformant error response.

## Parameters

### response

`unknown`

## Returns

`boolean`
