[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / resolveCompleteResultType

# Function: resolveCompleteResultType()

> **resolveCompleteResultType**(`result`): `string`

Defined in: [protocol/completion.ts:433](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/completion.ts#L433)

Resolves the `resultType` of a received `completion/complete` result, treating
an absent value as `"complete"`. (R-19.4-l, AC-29.18)

## Parameters

### result

The raw result object received on the wire.

#### resultType?

`unknown`

## Returns

`string`
