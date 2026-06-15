[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / augmentClientCapabilities

# Function: augmentClientCapabilities()

> **augmentClientCapabilities**(`declared`, `requiredCapabilities`): `Record`\<`string`, `unknown`\>

Defined in: [protocol/negotiation.ts:189](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/negotiation.ts#L189)

Produces the `clientCapabilities` object for a retry after a
`MissingRequiredClientCapability` (`-32003`) error: the originally declared
capabilities merged with the required ones. (R-5.6-i)

The merge is shallow — a required capability's settings object replaces any
previously declared value for that key — and never mutates its inputs.

## Parameters

### declared

`Record`\<`string`, `unknown`\>

### requiredCapabilities

`Record`\<`string`, `unknown`\>

## Returns

`Record`\<`string`, `unknown`\>
