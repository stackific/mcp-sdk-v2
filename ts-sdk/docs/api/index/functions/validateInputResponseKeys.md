[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / validateInputResponseKeys

# Function: validateInputResponseKeys()

> **validateInputResponseKeys**(`inputRequests`, `inputResponses`): `object`

Defined in: [protocol/multi-round-trip.ts:344](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/multi-round-trip.ts#L344)

Validates that every key in `inputResponses` was present in `inputRequests`.
Returns `false` (and fills `unknownKeys`) when any key in `inputResponses`
is not in `inputRequests`.

(R-11.2-h, R-11.4-c, R-11.4-d)

## Parameters

### inputRequests

`Record`\<`string`, `unknown`\>

Keys from the server's `InputRequiredResult`.

### inputResponses

`Record`\<`string`, `unknown`\>

Keys from the client's retry params.

## Returns

`object`

### valid

> **valid**: `boolean`

### unknownKeys

> **unknownKeys**: `string`[]
