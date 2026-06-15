[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / GetPromptResponseDiscrimination

# Type Alias: GetPromptResponseDiscrimination

> **GetPromptResponseDiscrimination** = \{ `kind`: `"complete"`; `result`: [`GetPromptResult`](GetPromptResult.md); \} \| \{ `kind`: `"input_required"`; `result`: [`InputRequiredResult`](InputRequiredResult.md); \} \| \{ `kind`: `"error"`; `reason`: `string`; `resultType`: `string` \| `undefined`; \}

Defined in: [protocol/prompts.ts:501](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/prompts.ts#L501)

What a client should do after receiving a `prompts/get` response. A client MUST
inspect `resultType` before parsing the body. (R-18.4-r, AC-28.35)
