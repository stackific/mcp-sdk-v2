[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / SUBSCRIPTION\_ID\_META\_KEY

# Variable: SUBSCRIPTION\_ID\_META\_KEY

> `const` **SUBSCRIPTION\_ID\_META\_KEY**: `"io.modelcontextprotocol/subscriptionId"`

Defined in: [protocol/streaming.ts:113](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/streaming.ts#L113)

The reserved `_meta` key carried on EVERY notification delivered for a
subscription (the acknowledgement included). Case-sensitive; MUST be reproduced
verbatim. Its value is the `subscriptions/listen` request `id` serialized as a
JSON string. (§10.4, R-10.4-a, R-10.4-b, R-10.4-f)
