[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [server](../README.md) / InMemoryTaskStoreOptions

# Interface: InMemoryTaskStoreOptions

Defined in: server/tasks.ts:39

Options for [InMemoryTaskStore](../classes/InMemoryTaskStore.md).

## Properties

### now?

> `optional` **now?**: () => `number`

Defined in: server/tasks.ts:41

Clock injection (default `Date.now`); lets tests drive ttl expiry deterministically.

#### Returns

`number`

***

### defaultPollIntervalMs?

> `optional` **defaultPollIntervalMs?**: `number`

Defined in: server/tasks.ts:43

Optional `pollIntervalMs` hint stamped on every created task. (§25.4)
