[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isResultTypeAccepted

# Function: isResultTypeAccepted()

> **isResultTypeAccepted**(`resultType`, `activeSet`, `activeContributions?`): `boolean`

Defined in: [protocol/extension-mechanism.ts:391](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/extension-mechanism.ts#L391)

Returns `true` when `resultType` is accepted: it is a core value, or it is
contributed by an extension that is in the active set. (R-24.5-e, R-24.5-f)

A value that is neither core nor contributed by an active extension is
INVALID — this returns `false`, and the receiver MUST treat the response as an
error (per §3.6 / S04 `interpretResultType`).

## Parameters

### resultType

`string`

### activeSet

`Iterable`\<`string`\>

### activeContributions?

`ReadonlyMap`\<`string`, `Iterable`\<`string`, `any`, `any`\>\> = `...`

## Returns

`boolean`
