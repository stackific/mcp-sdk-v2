[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / SamplingGateResult

# Type Alias: SamplingGateResult

> **SamplingGateResult** = \{ `ok`: `true`; \} \| \{ `ok`: `false`; `error`: `ReturnType`\<*typeof* [`buildSamplingToolsNotDeclaredError`](../functions/buildSamplingToolsNotDeclaredError.md)\>; \}

Defined in: [protocol/sampling.ts:554](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/sampling.ts#L554)

Outcome of [gateSamplingToolUse](../functions/gateSamplingToolUse.md) / [validateSamplingRequest](../functions/validateSamplingRequest.md).
