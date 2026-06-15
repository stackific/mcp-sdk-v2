[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [client](../README.md) / createRetryingTransport

# Function: createRetryingTransport()

> **createRetryingTransport**(`factory`, `options?`): [`Transport`](../../index/interfaces/Transport.md)

Defined in: client/retry.ts:35

Wraps `factory` (which builds a fresh inner transport) in a reconnecting
transport. The returned transport presents stable handler registration to a
[Client](../classes/Client.md) across inner reconnects.

## Parameters

### factory

() => [`Transport`](../../index/interfaces/Transport.md)

### options?

[`RetryOptions`](../interfaces/RetryOptions.md) = `{}`

## Returns

[`Transport`](../../index/interfaces/Transport.md)
