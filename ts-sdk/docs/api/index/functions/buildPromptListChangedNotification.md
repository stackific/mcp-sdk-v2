[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildPromptListChangedNotification

# Function: buildPromptListChangedNotification()

> **buildPromptListChangedNotification**(`meta?`): `objectOutputType`

Defined in: [protocol/prompts.ts:721](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/prompts.ts#L721)

Builds a `notifications/prompts/list_changed` notification. `params` (carrying
only `_meta`) is included only when `meta` is supplied. (§18.6, R-18.6-b,
R-18.6-c, AC-28.39, AC-28.40)

A server SHOULD only emit this when it declared `prompts.listChanged: true`
(R-18.6-a, R-18.6-g) — gate with [mayExpectPromptsListChanged](mayExpectPromptsListChanged.md) on the
receiving side. The server MAY emit it without any prior explicit subscription
(R-18.6-d).

## Parameters

### meta?

`Record`\<`string`, `unknown`\>

OPTIONAL reserved `_meta` map to attach via `params`.

## Returns

`objectOutputType`
