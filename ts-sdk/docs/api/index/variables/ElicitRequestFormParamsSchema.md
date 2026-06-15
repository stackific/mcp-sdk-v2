[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ElicitRequestFormParamsSchema

# Variable: ElicitRequestFormParamsSchema

> `const` **ElicitRequestFormParamsSchema**: `ZodObject`\<\{ `mode`: `ZodOptional`\<`ZodLiteral`\<`"form"`\>\>; `message`: `ZodString`; `requestedSchema`: `ZodObject`\<\{ `$schema`: `ZodOptional`\<`ZodString`\>; `type`: `ZodLiteral`\<`"object"`\>; `properties`: `ZodRecord`\<`ZodString`, `ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `required`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `$schema`: `ZodOptional`\<`ZodString`\>; `type`: `ZodLiteral`\<`"object"`\>; `properties`: `ZodRecord`\<`ZodString`, `ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `required`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `$schema`: `ZodOptional`\<`ZodString`\>; `type`: `ZodLiteral`\<`"object"`\>; `properties`: `ZodRecord`\<`ZodString`, `ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `required`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `mode`: `ZodOptional`\<`ZodLiteral`\<`"form"`\>\>; `message`: `ZodString`; `requestedSchema`: `ZodObject`\<\{ `$schema`: `ZodOptional`\<`ZodString`\>; `type`: `ZodLiteral`\<`"object"`\>; `properties`: `ZodRecord`\<`ZodString`, `ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `required`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `$schema`: `ZodOptional`\<`ZodString`\>; `type`: `ZodLiteral`\<`"object"`\>; `properties`: `ZodRecord`\<`ZodString`, `ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `required`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `$schema`: `ZodOptional`\<`ZodString`\>; `type`: `ZodLiteral`\<`"object"`\>; `properties`: `ZodRecord`\<`ZodString`, `ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `required`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `mode`: `ZodOptional`\<`ZodLiteral`\<`"form"`\>\>; `message`: `ZodString`; `requestedSchema`: `ZodObject`\<\{ `$schema`: `ZodOptional`\<`ZodString`\>; `type`: `ZodLiteral`\<`"object"`\>; `properties`: `ZodRecord`\<`ZodString`, `ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `required`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `$schema`: `ZodOptional`\<`ZodString`\>; `type`: `ZodLiteral`\<`"object"`\>; `properties`: `ZodRecord`\<`ZodString`, `ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `required`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `$schema`: `ZodOptional`\<`ZodString`\>; `type`: `ZodLiteral`\<`"object"`\>; `properties`: `ZodRecord`\<`ZodString`, `ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `required`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/elicitation.ts:154](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/elicitation.ts#L154)

Form-mode parameters: in-band structured collection against `requestedSchema`;
the collected data IS exposed to the client. (§20.3)

  - `mode` OPTIONAL; if present MUST be the literal `"form"`. A server MAY omit
    it; a client MUST treat a `params` with no `mode` as form mode.
    (R-20.3-a, R-20.3-b, R-20.3-c)
  - `message` REQUIRED string presented to the user describing the request.
    (R-20.3-d)
  - `requestedSchema` REQUIRED [RequestedSchema](../type-aliases/RequestedSchema.md). (R-20.3-e)
