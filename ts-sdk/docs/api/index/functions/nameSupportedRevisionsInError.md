[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / nameSupportedRevisionsInError

# Function: nameSupportedRevisionsInError()

> **nameSupportedRevisionsInError**\<`E`\>(`baseError`, `supported`): `E` & `object`

Defined in: [protocol/negotiation.ts:279](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/negotiation.ts#L279)

Adds the server's supported revisions to an error's `data.supported`, so a
peer with no fall-forward mechanism can still surface a useful diagnostic.
(R-5.7-g)

A server implementing only this protocol family SHOULD name its revisions in
any error it returns for an opening request it cannot interpret. Existing
`data` fields are preserved; `supported` is set/overwritten with the list.

## Type Parameters

### E

`E` *extends* `object`

## Parameters

### baseError

`E`

The error object to annotate (`code`/`message` required).

### supported

readonly `string`[]

The protocol revisions the server supports.

## Returns

`E` & `object`
