[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / assertCapability

# Function: assertCapability()

> **assertCapability**(`declaredCapabilities`, `required`): `void`

Defined in: [protocol/capabilities.ts:61](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/capabilities.ts#L61)

Asserts that a required capability has been declared by the peer for the
current request.

This function is intentionally stateless: it takes the set of declared
capabilities as a parameter rather than reading stored state. This design
enforces the per-request rule (R-2.2.2-a): callers must supply the
capabilities declared on the current request, not any accumulated state.
(AC-01.14)

## Parameters

### declaredCapabilities

`ReadonlySet`\<`string`\>

Set of capability names declared by the peer
  for the current request.

### required

`string`

The capability name required to process this request.

## Returns

`void`

## Throws

When `required` is not in
  `declaredCapabilities`. (R-2.2.2-c, AC-01.15)

## Example

```ts
assertCapability(new Set(['tools', 'resources']), 'tools'); // OK
assertCapability(new Set(['tools']), 'resources'); // throws MissingCapabilityError
```
