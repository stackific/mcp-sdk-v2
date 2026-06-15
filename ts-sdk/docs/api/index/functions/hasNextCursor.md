[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / hasNextCursor

# Function: hasNextCursor()

> **hasNextCursor**(`result`): `boolean`

Defined in: [protocol/pagination.ts:88](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/pagination.ts#L88)

Returns `true` when `nextCursor` is present in the result, indicating that
more results MAY be available and the client should request the next page.
(R-12.2-c, R-12.3-b)

Note: the empty string `""` is a PRESENT cursor — it is NOT treated as
absence. (R-12.1-a, R-12.3-d)

## Parameters

### result

#### nextCursor?

`string`

## Returns

`boolean`
