[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / INPUT\_REQUEST\_REQUIRED\_CAPABILITY

# Variable: INPUT\_REQUEST\_REQUIRED\_CAPABILITY

> `const` **INPUT\_REQUEST\_REQUIRED\_CAPABILITY**: `Readonly`\<`Record`\<`string`, [`ClientCapabilityName`](../type-aliases/ClientCapabilityName.md)\>\>

Defined in: [protocol/conformance-requirements.ts:627](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/conformance-requirements.ts#L627)

The map from an input-request kind to the client capability that authorizes a
server to place it into an `input_required` result. (§29.4 item 5, R-29.4-l)
A server MUST NOT include an input request of a kind the client has not
declared (e.g. no elicitation input request without the elicitation capability).
