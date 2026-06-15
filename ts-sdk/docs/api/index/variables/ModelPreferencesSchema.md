[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ModelPreferencesSchema

# Variable: ModelPreferencesSchema

> `const` **ModelPreferencesSchema**: `ZodObject`\<\{ `hints`: `ZodOptional`\<`ZodArray`\<`ZodObject`\<\{ `name`: `ZodOptional`\<`ZodString`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `name`: `ZodOptional`\<`ZodString`\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `name`: `ZodOptional`\<`ZodString`\>; \}, `ZodTypeAny`, `"passthrough"`\>\>, `"many"`\>\>; `costPriority`: `ZodOptional`\<`ZodNumber`\>; `speedPriority`: `ZodOptional`\<`ZodNumber`\>; `intelligencePriority`: `ZodOptional`\<`ZodNumber`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `hints`: `ZodOptional`\<`ZodArray`\<`ZodObject`\<\{ `name`: `ZodOptional`\<`ZodString`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `name`: `ZodOptional`\<`ZodString`\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `name`: `ZodOptional`\<`ZodString`\>; \}, `ZodTypeAny`, `"passthrough"`\>\>, `"many"`\>\>; `costPriority`: `ZodOptional`\<`ZodNumber`\>; `speedPriority`: `ZodOptional`\<`ZodNumber`\>; `intelligencePriority`: `ZodOptional`\<`ZodNumber`\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `hints`: `ZodOptional`\<`ZodArray`\<`ZodObject`\<\{ `name`: `ZodOptional`\<`ZodString`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `name`: `ZodOptional`\<`ZodString`\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `name`: `ZodOptional`\<`ZodString`\>; \}, `ZodTypeAny`, `"passthrough"`\>\>, `"many"`\>\>; `costPriority`: `ZodOptional`\<`ZodNumber`\>; `speedPriority`: `ZodOptional`\<`ZodNumber`\>; `intelligencePriority`: `ZodOptional`\<`ZodNumber`\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/sampling.ts:263](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/sampling.ts#L263)

`ModelPreferences` — the server's advisory model-selection priorities and
hints. (§21.2.9)

All preferences are advisory; the client MAY ignore them and makes the final
model selection. (R-21.2.9-a) When multiple `hints` are given the client MUST
evaluate them in order, first match. (R-21.2.9-b) The numeric priorities are
OPTIONAL numbers in the inclusive range 0–1. (R-21.2.9-e)
