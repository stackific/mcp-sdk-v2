[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isInDocumentRef

# Function: isInDocumentRef()

> **isInDocumentRef**(`ref`): `boolean`

Defined in: [protocol/tools.ts:193](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools.ts#L193)

Returns `true` when a `$ref` / `$dynamicRef` value resolves WITHIN the same
schema document — i.e. it is a document-local JSON Pointer (`#`, `#/…`) or a
plain-name fragment anchor (`#anchor`). An absolute or relative URI that names
another document is NOT in-document. (§16.4(5), R-16.4-f)

## Parameters

### ref

`string`

## Returns

`boolean`
