[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / validateIconBytes

# Function: validateIconBytes()

> **validateIconBytes**(`bytes`, `declaredMimeType?`, `allowedTypes?`): `string`

Defined in: [types/icon.ts:162](https://github.com/stackific/mcp-sdk-node/blob/main/src/types/icon.ts#L162)

Validates an icon's byte content before rendering. (R-14.2-r – R-14.2-u, AC-20.25–28)

1. Detects the actual MIME type from magic bytes (ignores declared type).
2. Rejects when the detected type is unknown.
3. When `declaredMimeType` is provided, rejects on mismatch.
4. Rejects types outside the `allowedTypes` set.

## Parameters

### bytes

`Uint8Array`

### declaredMimeType?

`string`

### allowedTypes?

`ReadonlySet`\<`string`\> = `DEFAULT_IMAGE_ALLOWLIST`

## Returns

`string`

The detected MIME type on success.

## Throws

On any validation failure.
