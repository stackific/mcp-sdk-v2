[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / expiresAt

# Function: expiresAt()

> **expiresAt**(`ttlMs`, `receivedAt`): `number`

Defined in: [protocol/caching.ts:154](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/caching.ts#L154)

Computes `expiresAt` — the absolute timestamp after which the result is stale.
(R-13.2-e, R-13.2-f)

## Parameters

### ttlMs

`number`

Non-negative freshness hint.

### receivedAt

`number`

Local receive timestamp in ms.

## Returns

`number`
