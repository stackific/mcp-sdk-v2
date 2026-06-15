[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / FetchIconResult

# Interface: FetchIconResult

Defined in: [types/icon.ts:194](https://github.com/stackific/mcp-sdk-node/blob/main/src/types/icon.ts#L194)

Result of [fetchIcon](../functions/fetchIcon.md): the validated image bytes, detected type, and final URL.

## Properties

### bytes

> **bytes**: `Uint8Array`

Defined in: [types/icon.ts:196](https://github.com/stackific/mcp-sdk-node/blob/main/src/types/icon.ts#L196)

The fetched image bytes.

***

### mimeType

> **mimeType**: `string`

Defined in: [types/icon.ts:198](https://github.com/stackific/mcp-sdk-node/blob/main/src/types/icon.ts#L198)

The MIME type detected from magic bytes (R-14.2-s).

***

### finalUrl

> **finalUrl**: `string`

Defined in: [types/icon.ts:200](https://github.com/stackific/mcp-sdk-node/blob/main/src/types/icon.ts#L200)

The URL the bytes were ultimately read from (same origin as `src`).
