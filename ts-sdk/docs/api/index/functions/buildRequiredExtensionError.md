[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildRequiredExtensionError

# Function: buildRequiredExtensionError()

> **buildRequiredExtensionError**(`identifier`): [`RequiredExtensionError`](../interfaces/RequiredExtensionError.md)

Defined in: [protocol/extension-mechanism.ts:580](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/extension-mechanism.ts#L580)

Builds an actionable error for the case where an implementation genuinely
requires an extension the other side does not advertise. (R-24.7-d, R-24.7-e)

The error identifies the required extension (in both the message and
`data.requiredExtension`) so the failure is not opaque and an operator or
developer can act on it.

## Parameters

### identifier

`string`

The required-but-absent extension identifier.

## Returns

[`RequiredExtensionError`](../interfaces/RequiredExtensionError.md)
