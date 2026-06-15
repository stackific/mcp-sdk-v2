[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / SAMPLING\_REPLACEMENT\_GUIDANCE

# Variable: SAMPLING\_REPLACEMENT\_GUIDANCE

> `const` **SAMPLING\_REPLACEMENT\_GUIDANCE**: `"Sampling is Deprecated. For new model-calling functionality, integrate directly with a model provider instead of delegating through sampling/createMessage."`

Defined in: [protocol/sampling.ts:87](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/sampling.ts#L87)

Guidance for builders adding new model-calling functionality: integrate
directly with a model provider rather than via sampling. (R-21.2.1-b)

Returned as data (not just prose) so a host can surface it in tooling.
