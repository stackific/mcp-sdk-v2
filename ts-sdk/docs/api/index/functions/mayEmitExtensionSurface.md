[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / mayEmitExtensionSurface

# Function: mayEmitExtensionSurface()

> **mayEmitExtensionSurface**(`identifier`, `activeSet`): `boolean`

Defined in: [protocol/extension-mechanism.ts:450](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/extension-mechanism.ts#L450)

Returns `true` when an extension MAY emit its surface in the current
interaction: it is present in `activeSet`. (R-24.1-c, R-24.3-e, R-24.5-c)

Extensions are disabled by default — a peer MUST NOT emit a method,
notification, reserved `_meta` key, `resultType` value, or field defined by an
extension that this predicate reports as not active.

## Parameters

### identifier

`string`

### activeSet

`Iterable`\<`string`\>

## Returns

`boolean`
