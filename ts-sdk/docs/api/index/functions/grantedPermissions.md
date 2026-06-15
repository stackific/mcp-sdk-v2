[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / grantedPermissions

# Function: grantedPermissions()

> **grantedPermissions**(`requested`, `declined?`): `objectOutputType`

Defined in: [protocol/ui-host.ts:1045](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui-host.ts#L1045)

Computes the GRANTED permission set for a UI resource, enforcing R-26.7-h:
the host MUST NOT grant any permission the resource did not request, and MAY
decline a requested one. The result is exactly what
`hostCapabilities.sandbox.permissions` reports. (§26.7, R-26.7-h; AC-42.15,
AC-42.16)

Starts from the resource's requested set (S41 `permissions`), keeps only
members the resource requested, and drops any the host chose to decline.

## Parameters

### requested

`objectOutputType`\<\{ `camera`: `ZodOptional`\<`ZodObject`\<\{ \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ \}, `ZodTypeAny`, `"passthrough"`\>\>\>; `microphone`: `ZodOptional`\<`ZodObject`\<\{ \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ \}, `ZodTypeAny`, `"passthrough"`\>\>\>; `geolocation`: `ZodOptional`\<`ZodObject`\<\{ \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ \}, `ZodTypeAny`, `"passthrough"`\>\>\>; `clipboardWrite`: `ZodOptional`\<`ZodObject`\<\{ \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ \}, `ZodTypeAny`, `"passthrough"`\>\>\>; \}, `ZodTypeAny`, `"passthrough"`\> \| `undefined`

The resource's declared `permissions` (S41), or `undefined`.

### declined?

`Iterable`\<`string`\> = `[]`

The subset of requested permissions the host declines
  (the host's own R-26.7-h choice); members not requested are ignored.

## Returns

`objectOutputType`
