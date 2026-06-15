[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isHttpsResourceUri

# Function: isHttpsResourceUri()

> **isHttpsResourceUri**(`value`): `boolean`

Defined in: [protocol/resources-read.ts:595](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/resources-read.ts#L595)

Returns `true` when `value` is an `https`-scheme resource URI — the case in
which a client MAY fetch the resource directly from the web rather than via
`resources/read`. (§17.5, §17.9, R-17.5-y, R-17.9-b)

## Parameters

### value

`unknown`

## Returns

`boolean`
