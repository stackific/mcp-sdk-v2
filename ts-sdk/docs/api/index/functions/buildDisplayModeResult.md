[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildDisplayModeResult

# Function: buildDisplayModeResult()

> **buildDisplayModeResult**(`_requested`, `applied`): `objectOutputType`

Defined in: [protocol/ui-host.ts:993](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui-host.ts#L993)

Applies a `ui/request-display-mode` request: the host MAY grant a mode
different from the one requested, and the result reports the mode actually
applied. (§26.5.3, R-26.5.3-e; AC-42.9)

## Parameters

### \_requested

`"inline"` \| `"fullscreen"` \| `"pip"`

### applied

`"inline"` \| `"fullscreen"` \| `"pip"`

The mode the host actually applies (MAY differ).

## Returns

`objectOutputType`
