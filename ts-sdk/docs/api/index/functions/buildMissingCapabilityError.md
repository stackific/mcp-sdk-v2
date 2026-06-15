[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildMissingCapabilityError

# Function: buildMissingCapabilityError()

> **buildMissingCapabilityError**(`requiredCapabilities`): `object`

Defined in: [protocol/meta.ts:306](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/meta.ts#L306)

Builds the JSON-RPC error payload for a missing-required-client-capability
rejection. (R-4.3-k)

On the HTTP transport, the response status MUST also be `400 Bad Request`.

## Parameters

### requiredCapabilities

`Record`\<`string`, `unknown`\>

Map whose keys are the capability names that
  were required but not declared in `clientCapabilities`.

## Returns

`object`

### code

> **code**: `-32003`

### message

> **message**: `string`

### data

> **data**: [`MissingCapabilityErrorData`](../interfaces/MissingCapabilityErrorData.md)
