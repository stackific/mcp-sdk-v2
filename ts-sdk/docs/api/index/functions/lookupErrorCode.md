[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / lookupErrorCode

# Function: lookupErrorCode()

> **lookupErrorCode**(`code`): [`ErrorCodeRegistryEntry`](../interfaces/ErrorCodeRegistryEntry.md) \| `undefined`

Defined in: [protocol/errors.ts:248](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/errors.ts#L248)

Looks up the registry entry for `code`, or `undefined` if the code is not in
the §22 registry. An absent entry is not an error — receivers MUST tolerate
unknown codes (see [describeUnknownErrorCode](describeUnknownErrorCode.md)). (R-22.7-e)

## Parameters

### code

`number`

## Returns

[`ErrorCodeRegistryEntry`](../interfaces/ErrorCodeRegistryEntry.md) \| `undefined`
