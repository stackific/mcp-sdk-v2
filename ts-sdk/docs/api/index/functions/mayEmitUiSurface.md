[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / mayEmitUiSurface

# Function: mayEmitUiSurface()

> **mayEmitUiSurface**(`activeSet`): `boolean`

Defined in: [protocol/ui.ts:366](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui.ts#L366)

Returns `true` when the apps extension is in `activeSet` and the server MAY
therefore emit its surface (the `_meta.ui` key, the `ui://` resource) for this
interaction. (§26.2, R-26.2-a; reuses S38 [mayEmitExtensionSurface](mayEmitExtensionSurface.md).)

## Parameters

### activeSet

`Iterable`\<`string`\>

The identifiers active for this interaction (e.g. from
  S38 `computeActiveSet` / `activeSetForRequest`).

## Returns

`boolean`
