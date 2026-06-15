[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / acceptedResultTypes

# Function: acceptedResultTypes()

> **acceptedResultTypes**(`activeSet`, `activeContributions?`): `Set`\<`string`\>

Defined in: [protocol/extension-mechanism.ts:370](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/extension-mechanism.ts#L370)

Returns the set of `resultType` values a receiver will accept for an
interaction: the core values together with every value contributed by an
extension in `activeContributions` that is also in `activeSet`. (R-24.5-e)

Contributions from a NON-active extension are excluded — a `resultType`
defined by an inactive extension is never accepted. (R-24.5-f)

## Parameters

### activeSet

`Iterable`\<`string`\>

Identifiers active for this interaction (e.g.
  from [computeActiveSet](computeActiveSet.md)).

### activeContributions?

`ReadonlyMap`\<`string`, `Iterable`\<`string`, `any`, `any`\>\> = `...`

Map of extension identifier → the `resultType`
  values that extension contributes. Entries whose key is not in `activeSet`
  are ignored.

## Returns

`Set`\<`string`\>
