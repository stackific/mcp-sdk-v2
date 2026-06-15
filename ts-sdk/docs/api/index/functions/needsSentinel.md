[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / needsSentinel

# Function: needsSentinel()

> **needsSentinel**(`plain`): `boolean`

Defined in: [transport/http/param-encoding.ts:72](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/param-encoding.ts#L72)

Returns `true` when `plain` cannot be safely carried as a plain ASCII header
value and so MUST be sentinel-encoded. (R-9.5.3-b, R-9.5.3-e)

Unsafe when it contains non-ASCII or control characters, has leading or
trailing whitespace, or already matches the sentinel shape (to avoid
ambiguity). Safe ASCII is visible ASCII `0x21`–`0x7E`, space `0x20`, and
horizontal tab `0x09`, with no leading/trailing whitespace.

## Parameters

### plain

`string`

## Returns

`boolean`
