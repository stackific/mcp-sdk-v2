[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / SAMPLING\_INPUT\_REQUEST\_METHOD

# Variable: SAMPLING\_INPUT\_REQUEST\_METHOD

> `const` **SAMPLING\_INPUT\_REQUEST\_METHOD**: `"sampling/createMessage"` = `SAMPLING_METHOD`

Defined in: [protocol/sampling.ts:910](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/sampling.ts#L910)

A sampling request is delivered via the S17 input-required envelope: the
carried input request is a [SamplingInputRequestSchema](SamplingInputRequestSchema.md) whose `params`
are [CreateMessageRequestParamsSchema](CreateMessageRequestParamsSchema.md). The S17 `CreateMessageResultSchema`
(re-exported above) remains the kind-correlation schema for the multi-round-trip
`inputResponses`; [SamplingCreateMessageResultSchema](SamplingCreateMessageResultSchema.md) is the §21.2.8 full
shape. Both accept the same wire objects.
