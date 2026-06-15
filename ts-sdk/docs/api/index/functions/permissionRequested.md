[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / permissionRequested

# Function: permissionRequested()

> **permissionRequested**(`permissions`, `name`): `boolean`

Defined in: [protocol/ui.ts:708](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui.ts#L708)

Returns `true` when a UI resource's `permissions` REQUESTS the named sandbox
capability — i.e. the member is present. Absence means the capability is not
requested, and the host MUST NOT grant it. (§26.4, R-26.4-i, R-26.4-j)

## Parameters

### permissions

`objectOutputType`\<\{ `camera`: `ZodOptional`\<`ZodObject`\<\{ \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ \}, `ZodTypeAny`, `"passthrough"`\>\>\>; `microphone`: `ZodOptional`\<`ZodObject`\<\{ \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ \}, `ZodTypeAny`, `"passthrough"`\>\>\>; `geolocation`: `ZodOptional`\<`ZodObject`\<\{ \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ \}, `ZodTypeAny`, `"passthrough"`\>\>\>; `clipboardWrite`: `ZodOptional`\<`ZodObject`\<\{ \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ \}, `ZodTypeAny`, `"passthrough"`\>\>\>; \}, `ZodTypeAny`, `"passthrough"`\> \| `undefined`

The UI resource's declared `permissions`, or `undefined`.

### name

`"camera"` \| `"microphone"` \| `"geolocation"` \| `"clipboardWrite"`

The capability to test.

## Returns

`boolean`
