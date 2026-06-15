[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / discriminateGetPromptResponse

# Function: discriminateGetPromptResponse()

> **discriminateGetPromptResponse**(`response`): [`GetPromptResponseDiscrimination`](../type-aliases/GetPromptResponseDiscrimination.md)

Defined in: [protocol/prompts.ts:523](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/prompts.ts#L523)

Branches a `prompts/get` response on its `resultType` discriminator. (R-18.4-q,
R-18.4-r, AC-28.35)

  - `"complete"` (or absent, R-18.4-p) and a well-formed `GetPromptResult` →
    `{ kind: "complete", result }`.
  - `"input_required"` and a well-formed `InputRequiredResult` (§11 / S17) →
    `{ kind: "input_required", result }`.
  - any unrecognized `resultType`, or a body that fails its schema →
    `{ kind: "error" }`.

Reuses `discriminateResultType` (S17) for the result-type branching so the
§3.6/§11.5 receiver rules (absent ⇒ complete; unrecognized ⇒ error) apply
uniformly, then validates the completed body against `GetPromptResultSchema`.

## Parameters

### response

`unknown`

The raw `result` object received on the wire.

## Returns

[`GetPromptResponseDiscrimination`](../type-aliases/GetPromptResponseDiscrimination.md)
