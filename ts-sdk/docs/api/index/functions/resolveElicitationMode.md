[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / resolveElicitationMode

# Function: resolveElicitationMode()

> **resolveElicitationMode**(`params`): [`ElicitationMode`](../type-aliases/ElicitationMode.md) \| `undefined`

Defined in: [protocol/elicitation.ts:273](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/elicitation.ts#L273)

Resolves the effective elicitation mode of a `params` object, applying the
backwards-compatibility rule that an absent `mode` means form mode.
(§20.3, R-20.3-b, R-20.3-c)

Returns `"form"` when `mode` is absent or the literal `"form"`, `"url"` when
it is the literal `"url"`, and `undefined` for any other (malformed) value.

## Parameters

### params

`unknown`

An `ElicitRequestParams`-shaped object.

## Returns

[`ElicitationMode`](../type-aliases/ElicitationMode.md) \| `undefined`
