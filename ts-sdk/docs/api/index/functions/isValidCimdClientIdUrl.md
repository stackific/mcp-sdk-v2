[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isValidCimdClientIdUrl

# Function: isValidCimdClientIdUrl()

> **isValidCimdClientIdUrl**(`clientId`): `boolean`

Defined in: [protocol/authorization-flow.ts:322](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L322)

Returns `true` when `clientId` is a syntactically valid CIMD `client_id` URL:
an absolute `https` URL that contains a (non-root) path component. (R-23.4-e)

A bare-origin URL like `https://app.example.com` (path `/`) is rejected — the
spec requires a path component identifying the metadata document.

## Parameters

### clientId

`string`

The candidate `client_id` URL.

## Returns

`boolean`
