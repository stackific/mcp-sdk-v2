[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / httpStatusForRegistryCode

# Function: httpStatusForRegistryCode()

> **httpStatusForRegistryCode**(`code`): `number` \| `undefined`

Defined in: [protocol/errors.ts:573](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/errors.ts#L573)

Maps an error `code` to the Streamable HTTP status it MUST ride on. (§22.6,
AC-34.19, AC-34.20) `-32003`/`-32004` (negotiation) and `-32001`
(HeaderMismatch) all map to `400 Bad Request` (R-22.6-a, R-22.6-b); codes the
registry does not pin to a status return `undefined`. The numeric `code` is
the same on every transport — this only supplies the HTTP overlay. (R-22-a)

## Parameters

### code

`number`

## Returns

`number` \| `undefined`
