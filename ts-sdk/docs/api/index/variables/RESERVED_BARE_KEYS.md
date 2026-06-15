[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / RESERVED\_BARE\_KEYS

# Variable: RESERVED\_BARE\_KEYS

> `const` **RESERVED\_BARE\_KEYS**: `Set`\<`"progressToken"` \| `"traceparent"` \| `"tracestate"` \| `"baggage"`\>

Defined in: [protocol/meta.ts:39](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/meta.ts#L39)

The four bare keys (no prefix) that are RESERVED and MAY appear in `_meta`.
(§4.2, R-4.2-j)

All other bare keys are non-conformant (they have no prefix and are not in
this set). `progressToken` correlates progress notifications (§15 / S22);
the three W3C keys carry distributed-trace context (§4.2 / R-4.2-l, R-4.2-m).
