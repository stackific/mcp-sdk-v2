[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / validateIconSrc

# Function: validateIconSrc()

> **validateIconSrc**(`src`): `void`

Defined in: [types/icon.ts:91](https://github.com/stackific/mcp-sdk-node/blob/main/src/types/icon.ts#L91)

Validates an icon `src` URI against the security rules (§14.2).

A consumer MUST accept only `https:` URLs or `data:` URIs. (R-14.2-o, AC-20.22)
A consumer MUST reject `javascript:`, `file:`, `ftp:`, `ws:`, and other
unsafe schemes. (R-14.2-n, AC-20.21)

Note: `http:` is also rejected because R-14.2-o's stricter rule governs
consumer acceptance and supersedes the field description in R-14.2-d.

## Parameters

### src

`string`

## Returns

`void`

## Throws

When the scheme is not `https:` or `data:`.
