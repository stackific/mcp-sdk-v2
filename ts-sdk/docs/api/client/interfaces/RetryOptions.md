[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [client](../README.md) / RetryOptions

# Interface: RetryOptions

Defined in: client/retry.ts:21

Options for [createRetryingTransport](../functions/createRetryingTransport.md).

## Properties

### maxRetries?

> `optional` **maxRetries?**: `number`

Defined in: client/retry.ts:23

Max consecutive reconnect attempts before giving up (default `Infinity`).

***

### baseDelayMs?

> `optional` **baseDelayMs?**: `number`

Defined in: client/retry.ts:25

Base backoff delay in ms (default 250).

***

### maxDelayMs?

> `optional` **maxDelayMs?**: `number`

Defined in: client/retry.ts:27

Max backoff delay in ms (default 10000).
