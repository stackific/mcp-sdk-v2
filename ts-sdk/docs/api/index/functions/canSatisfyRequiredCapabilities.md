[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / canSatisfyRequiredCapabilities

# Function: canSatisfyRequiredCapabilities()

> **canSatisfyRequiredCapabilities**(`requiredCapabilities`, `clientSupported`): `boolean`

Defined in: [protocol/negotiation.ts:172](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/negotiation.ts#L172)

Returns `true` when the client can declare every capability the server named
as required — i.e. each required capability key is one the client supports.
(R-5.6-i)

## Parameters

### requiredCapabilities

`Record`\<`string`, `unknown`\>

The error's `data.requiredCapabilities`.

### clientSupported

`Record`\<`string`, `unknown`\>

The capabilities the client is able to offer.

## Returns

`boolean`
