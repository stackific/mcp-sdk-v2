[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildAcceptResult

# Function: buildAcceptResult()

> **buildAcceptResult**(`opts`): `objectOutputType`

Defined in: [protocol/elicitation-form.ts:977](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/elicitation-form.ts#L977)

Builds a form-mode `accept` [ElicitResult](../type-aliases/ElicitResult.md) carrying validated `content`.
(§20.5, R-20.5-c, R-20.5-i)

Validates `content` against `requestedSchema` before building (the client-side
pre-send check), so a malformed submission is rejected rather than sent.

## Parameters

### opts

#### content

[`ElicitContent`](../type-aliases/ElicitContent.md)

#### requestedSchema

`unknown`

## Returns

`objectOutputType`

## Throws

When `content` does not conform to `requestedSchema`.
