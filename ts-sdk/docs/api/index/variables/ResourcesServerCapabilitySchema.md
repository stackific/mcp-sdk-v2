[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ResourcesServerCapabilitySchema

# Variable: ResourcesServerCapabilitySchema

> `const` **ResourcesServerCapabilitySchema**: `ZodObject`\<\{ `listChanged`: `ZodOptional`\<`ZodBoolean`\>; `subscribe`: `ZodOptional`\<`ZodBoolean`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `listChanged`: `ZodOptional`\<`ZodBoolean`\>; `subscribe`: `ZodOptional`\<`ZodBoolean`\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `listChanged`: `ZodOptional`\<`ZodBoolean`\>; `subscribe`: `ZodOptional`\<`ZodBoolean`\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/resources.ts:79](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/resources.ts#L79)

The value of the `resources` key inside a server's capabilities object. Its
presence declares the feature; the two OPTIONAL boolean sub-flags declare the
optional notification behaviors. (§17.1, R-17.1-a, R-17.1-b)

  - `listChanged` (OPTIONAL boolean): when `true`, the server MAY emit
    `notifications/resources/list_changed` when the available-resource set
    changes. (R-17.1-c, R-17.1-d)
  - `subscribe` (OPTIONAL boolean): when `true`, the server supports per-resource
    `notifications/resources/updated` for subscribed resources. (R-17.1-e)

An empty object `{}` is a valid declaration carrying neither sub-flag. A server
MAY advertise either sub-flag independently, both, or neither. (R-17.1-f, R-17.1-g)
`.passthrough()` preserves forward-compatible additions.
