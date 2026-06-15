[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / selectFirstHintMatch

# Function: selectFirstHintMatch()

> **selectFirstHintMatch**(`hints`, `availableModels`): \{ `hint`: `objectOutputType`; `model`: `string`; \} \| `undefined`

Defined in: [protocol/sampling.ts:293](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/sampling.ts#L293)

Selects the first `ModelHint` whose `name` substring matches a candidate model
name, honoring the order-sensitive first-match rule. (R-21.2.9-b, R-21.2.9-f)

Hints are advisory: the caller (client/host) makes the final selection and MAY
ignore the result. (R-21.2.9-a) This helper only implements the substring
first-match semantics; it does not consult the numeric priorities, which the
client MAY use only to disambiguate among ambiguous matches. (R-21.2.9-c,
R-21.2.9-d)

## Parameters

### hints

`objectOutputType`\<\{ `name`: `ZodOptional`\<`ZodString`\>; \}, `ZodTypeAny`, `"passthrough"`\>[] \| `undefined`

Ordered hints from `ModelPreferences`.

### availableModels

`string`[]

Candidate model names the client can run.

## Returns

\{ `hint`: `objectOutputType`; `model`: `string`; \} \| `undefined`

The first `{ hint, model }` whose hint name is a substring of a
  candidate model name, or `undefined` when no hint matches.
