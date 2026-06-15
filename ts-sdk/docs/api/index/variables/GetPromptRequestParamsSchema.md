[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / GetPromptRequestParamsSchema

# Variable: GetPromptRequestParamsSchema

> `const` **GetPromptRequestParamsSchema**: `ZodObject`\<\{ `name`: `ZodString`; `arguments`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodString`\>\>; `inputResponses`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `requestState`: `ZodOptional`\<`ZodString`\>; `_meta`: `ZodRecord`\<`ZodString`, `ZodUnknown`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `name`: `ZodString`; `arguments`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodString`\>\>; `inputResponses`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `requestState`: `ZodOptional`\<`ZodString`\>; `_meta`: `ZodRecord`\<`ZodString`, `ZodUnknown`\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `name`: `ZodString`; `arguments`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodString`\>\>; `inputResponses`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `requestState`: `ZodOptional`\<`ZodString`\>; `_meta`: `ZodRecord`\<`ZodString`, `ZodUnknown`\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/prompts.ts:405](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/prompts.ts#L405)

The `params` of a `prompts/get` request. May participate in a multi-round-trip
exchange (§11), so it carries the S17 retry fields. (§18.4)

Field constraints (R-18.4-a – R-18.4-k):
  - `name` REQUIRED — the prompt to retrieve; MUST match a `Prompt.name` the
    server offers (R-18.4-b, R-18.4-c).
  - `arguments` OPTIONAL map<string,string> — values keyed by
    `PromptArgument.name`; MUST include every `required: true` argument
    (R-18.4-e).
  - `inputResponses` OPTIONAL map<string,unknown> — multi-round-trip retry
    responses (§11); for each key in the server's prior `inputRequests`, the
    same key MUST appear here (R-18.4-h). Omitted on a first attempt.
  - `requestState` OPTIONAL opaque string — echoed verbatim on retry; treated as
    opaque (R-18.4-i – R-18.4-k). Omitted on a first attempt.
  - `_meta` OPTIONAL reserved metadata map.

`_meta` is REQUIRED on the wire (every client request carries it, S04), so it is
modeled as a required record here, matching `RequestParamsSchema`.
`.passthrough()` preserves forward-compatible additions.
