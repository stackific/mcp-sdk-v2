[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isConventionalToolName

# Function: isConventionalToolName()

> **isConventionalToolName**(`name`): `boolean`

Defined in: [protocol/tools.ts:527](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools.ts#L527)

Returns `true` when a tool `name` follows the recommended conventions: 1–128
characters, only `A–Z a–z 0–9 _ - .`, and therefore no spaces/commas/other
special characters. Names SHOULD be treated case-sensitively (this check is
itself case-preserving). (§16.3, R-16.3-b, R-16.3-c, R-16.3-d, R-16.3-e)

## Parameters

### name

`string`

## Returns

`boolean`
