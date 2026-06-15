[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / httpStatusForNegotiationError

# Function: httpStatusForNegotiationError()

> **httpStatusForNegotiationError**(`code`): `400` \| `undefined`

Defined in: [protocol/negotiation.ts:61](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/negotiation.ts#L61)

Returns `400` when `code` is one of the two negotiation error codes
(`-32004`, `-32003`), which on the HTTP transport MUST ride a
`400 Bad Request`; `undefined` otherwise. (R-5.5-b, R-5.6-d)

## Parameters

### code

`number`

## Returns

`400` \| `undefined`
