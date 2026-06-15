[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildFormElicitRequest

# Function: buildFormElicitRequest()

> **buildFormElicitRequest**(`opts`): `objectOutputType`

Defined in: [protocol/elicitation.ts:515](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/elicitation.ts#L515)

Builds a well-formed form-mode [ElicitRequest](../type-aliases/ElicitRequest.md). (§20.2, §20.3)

The `mode` field is omitted by default (the backwards-compatible form-mode
encoding, R-20.3-b); pass `includeMode: true` to emit the explicit
`mode: "form"`. The `requestedSchema` is validated against the flat-object
restriction before the request is built.

## Parameters

### opts

#### message

`string`

#### requestedSchema

`unknown`

#### includeMode?

`boolean`

## Returns

`objectOutputType`

## Throws

When `requestedSchema` violates the restriction (§20.4).
