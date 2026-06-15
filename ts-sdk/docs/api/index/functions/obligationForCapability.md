[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / obligationForCapability

# Function: obligationForCapability()

> **obligationForCapability**(`capability`): [`CapabilityObligation`](../interfaces/CapabilityObligation.md) \| `undefined`

Defined in: [protocol/conformance-requirements.ts:400](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/conformance-requirements.ts#L400)

Returns the obligation a party incurs by advertising `capability`, or
`undefined` when the capability carries no enumerated feature-section
obligation beyond the baseline. (§29.4)

## Parameters

### capability

`string`

## Returns

[`CapabilityObligation`](../interfaces/CapabilityObligation.md) \| `undefined`
