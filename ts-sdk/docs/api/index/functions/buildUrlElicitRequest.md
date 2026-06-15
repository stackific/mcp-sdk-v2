[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildUrlElicitRequest

# Function: buildUrlElicitRequest()

> **buildUrlElicitRequest**(`opts`): `objectOutputType`

Defined in: [protocol/elicitation.ts:542](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/elicitation.ts#L542)

Builds a well-formed url-mode [ElicitRequest](../type-aliases/ElicitRequest.md). (§20.2, §20.3)

`mode: "url"` is REQUIRED and always emitted (R-20.3-i). The `url` is checked
for validity before the request is built. (R-20.3-n)

## Parameters

### opts

#### message

`string`

#### elicitationId

`string`

#### url

`string`

## Returns

`objectOutputType`

## Throws

When `url` is not a valid absolute URI/URL (R-20.3-n) or
  `elicitationId` is empty (R-20.3-k).
