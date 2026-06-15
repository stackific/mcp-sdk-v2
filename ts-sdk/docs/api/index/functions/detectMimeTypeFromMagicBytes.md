[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / detectMimeTypeFromMagicBytes

# Function: detectMimeTypeFromMagicBytes()

> **detectMimeTypeFromMagicBytes**(`bytes`): `string` \| `null`

Defined in: [types/icon.ts:129](https://github.com/stackific/mcp-sdk-node/blob/main/src/types/icon.ts#L129)

Detects the MIME type of an image from its magic bytes, treating the
declared MIME type as advisory only. (R-14.2-s, AC-20.26)

Returns `null` when no known signature matches.

## Parameters

### bytes

`Uint8Array`

## Returns

`string` \| `null`
