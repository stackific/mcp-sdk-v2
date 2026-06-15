[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / stripDefaultTrailingSlash

# Function: stripDefaultTrailingSlash()

> **stripDefaultTrailingSlash**(`uri`, `slashIsSignificant?`): `string`

Defined in: [protocol/authorization.ts:326](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization.ts#L326)

Returns `uri` with a single trailing slash removed when the slash is not
semantically significant. (R-23.1-s)

An implementation SHOULD use the trailing-slash-free form unless the slash is
significant for the resource; the caller asserts significance via
`slashIsSignificant`. A path of just `"/"` (the bare-host root) is left
untouched — removing it would change the host's root into a schemeless string.

## Parameters

### uri

`string`

The candidate URI.

### slashIsSignificant?

`boolean` = `false`

When `true`, the trailing slash is preserved.

## Returns

`string`
