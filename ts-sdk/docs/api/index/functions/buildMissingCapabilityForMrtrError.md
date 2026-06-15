[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildMissingCapabilityForMrtrError

# Function: buildMissingCapabilityForMrtrError()

> **buildMissingCapabilityForMrtrError**(`requiredCapabilities`): `object`

Defined in: [protocol/multi-round-trip.ts:318](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/multi-round-trip.ts#L318)

Builds the JSON-RPC error payload for a missing-required-client-capability
rejection when a server cannot complete without an unsupported input-request
kind. (R-11.5-i, R-11.5-j)

The `code` is `-32003`; on the HTTP transport the response status MUST be
`400 Bad Request`.

## Parameters

### requiredCapabilities

`Record`\<`string`, `unknown`\>

A `ClientCapabilities`-shaped map (capability
  name → settings object) naming the unsupported capabilities.

## Returns

`object`

### code

> **code**: `-32003`

### message

> **message**: `string`

### data

> **data**: `object`

#### data.requiredCapabilities

> **requiredCapabilities**: `Record`\<`string`, `unknown`\>
