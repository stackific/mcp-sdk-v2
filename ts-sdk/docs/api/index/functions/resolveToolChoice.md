[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / resolveToolChoice

# Function: resolveToolChoice()

> **resolveToolChoice**(`toolChoice`): `object`

Defined in: [protocol/sampling.ts:340](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/sampling.ts#L340)

Resolves the effective `ToolChoice`, applying the `{ mode: "auto" }` default
for an omitted `toolChoice` or an omitted `mode`. (R-21.2.4-p)

## Parameters

### toolChoice

`objectOutputType`\<\{ `mode`: `ZodOptional`\<`ZodEnum`\<\[`"auto"`, `"required"`, `"none"`\]\>\>; \}, `ZodTypeAny`, `"passthrough"`\> \| `undefined`

## Returns

`object`

### mode

> **mode**: `"none"` \| `"required"` \| `"auto"`
