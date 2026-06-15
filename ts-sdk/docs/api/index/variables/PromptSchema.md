[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / PromptSchema

# Variable: PromptSchema

> `const` **PromptSchema**: `ZodObject`\<`object` & `object`, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/prompts.ts:215](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/prompts.ts#L215)

A single prompt (or prompt template) offered by the server. Carries
`BaseMetadata` (`name` REQUIRED, `title` OPTIONAL, §14.1) and an OPTIONAL icon
set (§14.2). (§18.3)

Field constraints (R-18.3-a – R-18.3-d):
  - `name` REQUIRED — the value a client supplies in `prompts/get`; display-name
    fallback when `title` is absent (R-18.3-b — use [resolveDisplayName](../functions/resolveDisplayName.md)).
  - `title` OPTIONAL — human-readable display name.
  - `description` OPTIONAL — human-readable description.
  - `arguments` OPTIONAL `PromptArgument[]` — when absent or empty the prompt
    accepts no arguments (R-18.3-c, AC-28.22).
  - `icons` OPTIONAL `Icon[]` — sized icons the client MAY display. The `Icon`
    shape and its MIME-type / trust / SVG-script rules are owned and validated
    by S20 (§14.2); this schema only carries the field. (R-18.3-d – R-18.3-i)
  - `_meta` OPTIONAL — reserved metadata map (§14).

`.passthrough()` preserves forward-compatible additions.
