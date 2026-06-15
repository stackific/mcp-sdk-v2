[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / computeMissingClientCapabilities

# Function: computeMissingClientCapabilities()

> **computeMissingClientCapabilities**(`declared`, `required`): `Record`\<`string`, `unknown`\>

Defined in: [protocol/capability-negotiation.ts:302](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/capability-negotiation.ts#L302)

Returns the subset of `required` capabilities not present in `declared`
(compared by top-level key presence — capabilities are never inferred from a
prior request). (R-6.4-c, R-6.4-d, R-6.4-h)

## Parameters

### declared

`Record`\<`string`, `unknown`\>

### required

`Record`\<`string`, `unknown`\>

## Returns

`Record`\<`string`, `unknown`\>
