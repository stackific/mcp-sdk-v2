[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isServerResponsibility

# Function: isServerResponsibility()

> **isServerResponsibility**(`responsibility`): `boolean`

Defined in: [protocol/ui.ts:185](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui.ts#L185)

Returns `true` when `responsibility` belongs to the server (and server-side
SDK) — i.e. it is one of the only two server obligations, declaring `_meta.ui`
and serving the `ui://` resource. (R-26.1-b, R-26.1-c)

Every other responsibility — render, sandbox, enforce CSP/permissions, run
the channel, mediate consent — returns `false`: a conforming server SDK does
NOT carry them and MUST be implementable with no rendering/browser/UI-toolkit
dependency. (R-26.1-d, R-26.1-i)

## Parameters

### responsibility

[`UiResponsibility`](../type-aliases/UiResponsibility.md)

## Returns

`boolean`
