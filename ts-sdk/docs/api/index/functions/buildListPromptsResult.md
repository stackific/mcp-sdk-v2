[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildListPromptsResult

# Function: buildListPromptsResult()

> **buildListPromptsResult**(`config`): `objectOutputType`

Defined in: [protocol/prompts.ts:363](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/prompts.ts#L363)

Builds a completed `ListPromptsResult`. `resultType` is set to `"complete"`
(R-18.2-n); optional `nextCursor` and `_meta` are included only when supplied —
they are never defaulted. (§18.2)

## Parameters

### config

[`ListPromptsResultConfig`](../interfaces/ListPromptsResultConfig.md)

## Returns

`objectOutputType`

## Throws

When `config.ttlMs` is negative or non-integer — `ttlMs`
  has a minimum of 0 (R-18.2-h).
