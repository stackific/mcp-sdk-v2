[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildCompleteResult

# Function: buildCompleteResult()

> **buildCompleteResult**(`config`): `objectOutputType`

Defined in: [protocol/completion.ts:469](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/completion.ts#L469)

Builds a successful `CompleteResult`. `resultType` is set to `"complete"`
(R-19.4-j). Optional `total`, `hasMore`, and `_meta` are included only when
supplied — they are never defaulted. (§19.4)

## Parameters

### config

[`CompleteResultConfig`](../interfaces/CompleteResultConfig.md)

## Returns

`objectOutputType`

## Throws

When more than 100 `values` are supplied — a server with
  more than 100 matches MUST cap `values` at 100 (use [computeCompletion](computeCompletion.md)
  to cap and signal truncation automatically). (R-19.4-c, R-19.4-d, R-19.5-g)
