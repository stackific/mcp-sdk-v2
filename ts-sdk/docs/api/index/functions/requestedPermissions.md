[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / requestedPermissions

# Function: requestedPermissions()

> **requestedPermissions**(`permissions`): (`"camera"` \| `"microphone"` \| `"geolocation"` \| `"clipboardWrite"`)[]

Defined in: [protocol/ui.ts:724](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui.ts#L724)

Returns the set of sandbox capabilities a UI resource requests, as the subset
of [UI\_PERMISSION\_NAMES](../variables/UI_PERMISSION_NAMES.md) present in `permissions`. The host MUST NOT
grant any capability outside this set (R-26.4-j) and MAY decline any within it
(R-26.4-k). (§26.4, R-26.4-i)

## Parameters

### permissions

`objectOutputType`\<\{ `camera`: `ZodOptional`\<`ZodObject`\<\{ \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ \}, `ZodTypeAny`, `"passthrough"`\>\>\>; `microphone`: `ZodOptional`\<`ZodObject`\<\{ \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ \}, `ZodTypeAny`, `"passthrough"`\>\>\>; `geolocation`: `ZodOptional`\<`ZodObject`\<\{ \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ \}, `ZodTypeAny`, `"passthrough"`\>\>\>; `clipboardWrite`: `ZodOptional`\<`ZodObject`\<\{ \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ \}, `ZodTypeAny`, `"passthrough"`\>\>\>; \}, `ZodTypeAny`, `"passthrough"`\> \| `undefined`

The UI resource's declared `permissions`, or `undefined`.

## Returns

(`"camera"` \| `"microphone"` \| `"geolocation"` \| `"clipboardWrite"`)[]
