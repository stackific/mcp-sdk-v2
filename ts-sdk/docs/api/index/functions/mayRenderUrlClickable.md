[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / mayRenderUrlClickable

# Function: mayRenderUrlClickable()

> **mayRenderUrlClickable**(`fieldName`, `mode`): `boolean`

Defined in: [protocol/elicitation-form.ts:1377](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/elicitation-form.ts#L1377)

Returns `true` when a URL MAY be rendered as a clickable link for the given
field, enforcing the §20.7 rule that ONLY the `url` field of a URL-mode request
is clickable; no other field of any elicitation request may be. (§20.7,
R-20.7-r, R-20.7-y)

## Parameters

### fieldName

`string`

The field the URL would be rendered in.

### mode

[`ElicitationMode`](../type-aliases/ElicitationMode.md)

The mode of the elicitation request.

## Returns

`boolean`
