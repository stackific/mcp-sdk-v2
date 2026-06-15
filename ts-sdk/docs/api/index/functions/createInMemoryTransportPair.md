[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / createInMemoryTransportPair

# Function: createInMemoryTransportPair()

> **createInMemoryTransportPair**(): \[[`InMemoryTransport`](../classes/InMemoryTransport.md), [`InMemoryTransport`](../classes/InMemoryTransport.md)\]

Defined in: [transport/in-memory.ts:203](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/in-memory.ts#L203)

Creates a linked pair of in-memory transports. Anything one endpoint sends is
delivered to the other; closing or disconnecting either endpoint makes both
observe the close. (§7.1, §7.4, §7.2 clean close, §7.5)

## Returns

\[[`InMemoryTransport`](../classes/InMemoryTransport.md), [`InMemoryTransport`](../classes/InMemoryTransport.md)\]
