[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isElicitationCreateRequest

# Function: isElicitationCreateRequest()

> **isElicitationCreateRequest**(`value`): `boolean`

Defined in: [protocol/elicitation.ts:257](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/elicitation.ts#L257)

Returns `true` when `value` carries the exact, case-sensitive
`"elicitation/create"` method literal — the §11 input-request discriminator
an `ElicitRequest` MUST present. (§20.2, R-20.2-b)

This is a lightweight method-only check (it does not validate `params`); use
[isElicitRequest](isElicitRequest.md) for full structural validation.

## Parameters

### value

`unknown`

## Returns

`boolean`
