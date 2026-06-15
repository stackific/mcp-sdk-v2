[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ElicitationCapabilityValueSchema

# Variable: ElicitationCapabilityValueSchema

> `const` **ElicitationCapabilityValueSchema**: `ZodObject`\<\{ `form`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `url`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `form`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `url`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `form`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `url`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/elicitation.ts:96](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/elicitation.ts#L96)

The value placed under `ClientCapabilities.elicitation`. An object with two
OPTIONAL sub-flags, `form` and `url`, each (when present) an object selecting
a supported mode; an empty sub-flag object `{}` denotes support with no extra
settings. The whole value is itself OPTIONAL within `ClientCapabilities`.
(§20.1, R-20.1-f)

Structurally identical to the `ElicitationCapabilitySchema` embedded in S10's
`ClientCapabilitiesSchema`; named here so S30 callers can validate / build the
sub-object standalone. `.passthrough()` preserves forward-compatible additions.
