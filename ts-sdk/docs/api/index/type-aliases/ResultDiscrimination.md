[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ResultDiscrimination

# Type Alias: ResultDiscrimination

> **ResultDiscrimination** = \{ `action`: `"complete"`; \} \| \{ `action`: `"input_required"`; `result`: [`InputRequiredResult`](InputRequiredResult.md); \} \| \{ `action`: `"error"`; `reason`: `string`; `resultType`: `string` \| `undefined`; \}

Defined in: [protocol/multi-round-trip.ts:232](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/multi-round-trip.ts#L232)

Outcome of `discriminateResultType` — what a client should do after receiving
a result. (§11.5, R-11.5-c, R-11.5-d, R-11.5-e, R-11.5-f, R-11.6-c)
