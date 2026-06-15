[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / PromptArgumentSchema

# Variable: PromptArgumentSchema

> `const` **PromptArgumentSchema**: `ZodObject`\<`object` & `object`, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/prompts.ts:185](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/prompts.ts#L185)

One argument a prompt accepts for templating. Carries `BaseMetadata` (§14.1):
a REQUIRED `name` and OPTIONAL `title`. (§18.3)

Field constraints (R-18.3-j – R-18.3-l):
  - `name` REQUIRED — the key under which the client supplies a value in the
    `arguments` map of `prompts/get`.
  - `title` OPTIONAL — when absent, `name` SHOULD be used for display
    (use [resolveDisplayName](../functions/resolveDisplayName.md) from S20).
  - `description` OPTIONAL — human-readable description.
  - `required` OPTIONAL boolean — when `true`, the argument MUST be supplied in
    a `prompts/get` request.

`.passthrough()` preserves forward-compatible additions.
