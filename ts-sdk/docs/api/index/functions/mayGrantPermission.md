[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / mayGrantPermission

# Function: mayGrantPermission()

> **mayGrantPermission**(`permissions`, `name`, `hostDeclines?`): `boolean`

Defined in: [protocol/ui.ts:740](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui.ts#L740)

Returns `true` when a host MAY grant the named sandbox capability for a UI
resource: ONLY when it was requested (the host MUST NOT grant an unrequested
capability) AND the host did not decline it (the host MAY decline a requested
one). (§26.4, R-26.4-j, R-26.4-k)

## Parameters

### permissions

`objectOutputType`\<\{ `camera`: `ZodOptional`\<`ZodObject`\<\{ \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ \}, `ZodTypeAny`, `"passthrough"`\>\>\>; `microphone`: `ZodOptional`\<`ZodObject`\<\{ \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ \}, `ZodTypeAny`, `"passthrough"`\>\>\>; `geolocation`: `ZodOptional`\<`ZodObject`\<\{ \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ \}, `ZodTypeAny`, `"passthrough"`\>\>\>; `clipboardWrite`: `ZodOptional`\<`ZodObject`\<\{ \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ \}, `ZodTypeAny`, `"passthrough"`\>\>\>; \}, `ZodTypeAny`, `"passthrough"`\> \| `undefined`

The UI resource's declared `permissions`.

### name

`"camera"` \| `"microphone"` \| `"geolocation"` \| `"clipboardWrite"`

The capability under consideration.

### hostDeclines?

`boolean` = `false`

Whether the host chooses to decline this requested
  capability (the host's own decision, R-26.4-k); defaults to `false`.

## Returns

`boolean`
