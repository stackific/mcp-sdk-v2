[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / mayPlaceInputRequest

# Function: mayPlaceInputRequest()

> **mayPlaceInputRequest**(`method`, `clientCapabilities`): `boolean`

Defined in: [protocol/conformance-requirements.ts:642](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/conformance-requirements.ts#L642)

Returns `true` when a server MAY place an input request of `method` into an
`input_required` result for a client declaring `clientCapabilities`. (§29.4
item 5, R-29.4-l) An unrecognized method is rejected (`false`): a server must
not solicit a kind it cannot tie to a declared capability.

Reuses [RECOGNIZED\_INPUT\_REQUEST\_METHODS](../variables/RECOGNIZED_INPUT_REQUEST_METHODS.md) (S17) for the recognized-kind
set and [INPUT\_REQUEST\_REQUIRED\_CAPABILITY](../variables/INPUT_REQUEST_REQUIRED_CAPABILITY.md) for the gating capability.

## Parameters

### method

`string`

### clientCapabilities

`Record`\<`string`, `unknown`\>

## Returns

`boolean`
