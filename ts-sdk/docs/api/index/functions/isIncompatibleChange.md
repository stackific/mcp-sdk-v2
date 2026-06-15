[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isIncompatibleChange

# Function: isIncompatibleChange()

> **isIncompatibleChange**(`kind`): `boolean`

Defined in: [protocol/extension-mechanism.ts:511](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/extension-mechanism.ts#L511)

Returns `true` when a change of `kind` is INCOMPATIBLE — it would cause an
existing implementation to fail or behave incorrectly — and therefore SHOULD
be published under a new extension identifier. (R-24.6-d)

Backward-compatible changes (`add-optional-field`, `add-capability-flag`)
return `false`; they SHOULD instead be expressed via capability flags / a
version marker inside the existing identifier's settings object. (R-24.6-c)

## Parameters

### kind

[`ExtensionChangeKind`](../type-aliases/ExtensionChangeKind.md)

## Returns

`boolean`
